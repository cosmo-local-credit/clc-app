import { tokenTagsQueryOptions } from "@clc/api/features/deployments/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { PoolDeployPayload } from "@clc/core/features/pools/logic";
import {
  poolDescriptionSchema,
  poolNameSchema,
  poolSwapFeeSchema,
  poolSymbolSchema,
} from "@clc/core/features/pools/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import {
  CELO_MAINNET_CEUR_ADDRESS,
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_CKES_ADDRESS,
  CELO_MAINNET_CUSD_ADDRESS,
  CELO_MAINNET_CZAR_ADDRESS,
} from "@clc/core/lib/constants/celo";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FiLoader } from "react-icons/fi";
import { toast } from "sonner";
import { z } from "zod";
import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { PageHeader } from "#/components/admin/page-header";
import { SectionHeading } from "#/components/admin/section-heading";
import { LocationField } from "#/components/admin/location-field";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { ImageUploadField } from "#/components/admin/image-upload-field";
import { useAdminSession } from "#/features/auth/admin-session";
import { clcApi } from "#/lib/api";
import { CHAIN_ID } from "#/lib/chain";
import { isStorageConfigured } from "#/lib/storage";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";

import { usePoolPublishDeployment } from "./use-pool-publish-deployment";

const ORACLE_BASE_CODES = ["KES", "USD", "BAM", "BTN", "EUR", "INR", "ZAR"] as const;

type OracleBase = (typeof ORACLE_BASE_CODES)[number];

const ORACLE_OPTIONS = ORACLE_BASE_CODES.map((value) => ({ value, label: value }));

/**
 * The token an OracleQuoter prices against, per chain and per currency.
 *
 * Celo's are Mento's. A chain absent from this table has no feed the quoter can
 * read, so oracle pricing is not offered there at all — the alternative is a
 * console that lists it, takes a full form, and refuses at the last field.
 */
const ORACLE_BASES: Record<number, Partial<Record<OracleBase, string>>> = {
  [CELO_MAINNET_CHAIN_ID]: {
    KES: CELO_MAINNET_CKES_ADDRESS,
    USD: CELO_MAINNET_CUSD_ADDRESS,
    EUR: CELO_MAINNET_CEUR_ADDRESS,
    ZAR: CELO_MAINNET_CZAR_ADDRESS,
  },
};

const CHAIN_ORACLE_BASES = ORACLE_BASES[CHAIN_ID] ?? {};

const HAS_ORACLE_BASES = Object.keys(CHAIN_ORACLE_BASES).length > 0;

/**
 * "Managed rates" — the RelativeQuoter — is deliberately gone. It prices from
 * per-token rates somebody has to maintain by hand, and nothing in this product
 * maintains them: clc-core dropped the column that used to hold them. Equal
 * value covers the same need without the upkeep. The backend can still deploy
 * one, so pools already on it keep working and keep reading back correctly.
 */
const PRICING_OPTIONS = [
  ...(HAS_ORACLE_BASES ? [{ value: "oracle" as const, label: "Oracle rates" }] : []),
  { value: "decimal" as const, label: "Equal value" },
];

function isOracleBase(value: string): value is OracleBase {
  return (ORACLE_BASE_CODES as readonly string[]).includes(value);
}

function oracleBaseAddress(code: OracleBase): string | undefined {
  return CHAIN_ORACLE_BASES[code];
}

const requiredEmailSchema = z
  .string()
  .trim()
  .min(1, { message: "Email is required" })
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Invalid email address",
  });

const requiredPhoneSchema = z
  .string()
  .trim()
  .min(1, { message: "Phone is required" })
  .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), {
    message: "Invalid phone number",
  });

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

const requiredWebsiteSchema = z
  .string()
  .trim()
  .min(1, { message: "Website is required" })
  .refine(isHttpUrl, "Enter a valid website URL including https://");

const requiredTermsUrlSchema = z
  .string()
  .trim()
  .min(1, { message: "Terms URL is required" })
  .refine(isHttpUrl, "Enter a valid terms URL including https://");

const requiredCoordinateSchema = z
  .string()
  .trim()
  .min(1, { message: "Drop a pin on the map" })
  .refine((value) => Number.isFinite(Number(value)), { message: "Enter a number" });

const optionalStoredImageSchema = z
  .string()
  .refine((value) => value === "" || /^https?:\/\//.test(value), {
    message: "The image must be an http(s) URL",
  });

const poolPublishSchema = z
  .object({
    name: poolNameSchema,
    symbol: poolSymbolSchema,
    description: poolDescriptionSchema,
    pricing: z.enum(["oracle", "decimal"]),
    oracleBase: z.enum(ORACLE_BASE_CODES),
    feePolicyDefault: poolSwapFeeSchema,
    feesDecoupled: z.boolean(),
    locationName: z
      .string()
      .trim()
      .min(1, { message: "Location is required" })
      .max(160, { message: "Location must be 160 characters or fewer" }),
    latitude: requiredCoordinateSchema,
    longitude: requiredCoordinateSchema,
    tags: z.array(z.string()).min(1, { message: "Select at least one tag" }),
    email: requiredEmailSchema,
    website: requiredWebsiteSchema,
    phone: requiredPhoneSchema,
    terms: requiredTermsUrlSchema,
    // Optional, and already uploaded by the time they reach the form: the field
    // uploads on selection, so these hold a stored URL or nothing. clc-core
    // validates them as http(s) before it queues the deploy, because the catalog
    // column that receives them refuses anything else — and refusing it there
    // would mean a signed transaction with no catalog row.
    imageUrl: optionalStoredImageSchema,
    bannerUrl: optionalStoredImageSchema,
  })
  .superRefine((value, ctx) => {
    if (value.pricing === "oracle" && !oracleBaseAddress(value.oracleBase)) {
      ctx.addIssue({
        code: "custom",
        path: ["oracleBase"],
        message: "No token is configured for this currency",
      });
    }
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    if (Number.isFinite(latitude) && (latitude < -90 || latitude > 90)) {
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Use a latitude from -90 to 90",
      });
    }
    if (Number.isFinite(longitude) && (longitude < -180 || longitude > 180)) {
      ctx.addIssue({
        code: "custom",
        path: ["longitude"],
        message: "Use a longitude from -180 to 180",
      });
    }
  });

type PoolPublishValues = z.infer<typeof poolPublishSchema>;

const DEFAULT_VALUES: PoolPublishValues = {
  name: "",
  symbol: "",
  description: "",
  pricing: HAS_ORACLE_BASES ? "oracle" : "decimal",
  oracleBase: "KES",
  feePolicyDefault: "0",
  feesDecoupled: false,
  locationName: "",
  latitude: "",
  longitude: "",
  tags: [],
  email: "",
  website: "",
  phone: "",
  terms: "",
  imageUrl: "",
  bannerUrl: "",
};

/**
 * The deployment queue already owns contract creation. This form only collects
 * its accepted input and sends it there; it never pretends the console can
 * separately write contract pointers, roles, feeds, or liquidity.
 */
export function PoolPublishPage() {
  const session = useAdminSession();
  const tokenTags = useQuery(tokenTagsQueryOptions(clcApi.deployments));
  const deployment = usePoolPublishDeployment();
  const owner = session.status === "authenticated" ? session.operator.address : "";

  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onChange: poolPublishSchema, onSubmit: poolPublishSchema },
    onSubmit: async ({ value }) => {
      if (!owner) {
        toast.error("Could not identify the operator account.");
        return;
      }

      const latitude = value.latitude.trim();
      const longitude = value.longitude.trim();
      const baseCurrency =
        value.pricing === "oracle" ? oracleBaseAddress(value.oracleBase) : undefined;
      if (value.pricing === "oracle" && !baseCurrency) {
        toast.error("No token is configured for this oracle base currency.");
        return;
      }
      const payload: PoolDeployPayload = {
        name: value.name.trim(),
        symbol: value.symbol.trim(),
        decimals: "6",
        owner,
        quoterType: value.pricing,
        feesDecoupled: Number(value.feePolicyDefault) > 0 && value.feesDecoupled,
        feePolicyDefault: value.feePolicyDefault.trim(),
        ...(baseCurrency ? { baseCurrency } : {}),
        description: value.description.trim(),
        locationName: value.locationName.trim(),
        geoLat: Number(latitude),
        geoLng: Number(longitude),
        email: value.email.trim(),
        website: value.website.trim(),
        phone: value.phone.trim(),
        terms: value.terms.trim(),
        // Omitted when unset rather than sent empty: the deploy request treats
        // these as optional, and an empty string is not a URL.
        ...(value.imageUrl ? { imageUrl: value.imageUrl } : {}),
        ...(value.bannerUrl ? { bannerUrl: value.bannerUrl } : {}),
        tags: value.tags,
      };

      try {
        await deployment.publish(payload);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not publish this pool.");
      }
    },
  });

  if (session.status !== "authenticated") {
    return <p className="text-muted-foreground text-sm">Operator session is unavailable.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <AppBreadcrumb items={[{ label: "Pools", to: "/pools" }, { label: "Publish" }]} />
        }
        title="Publish pool"
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/pools" search={{ perPage: DEFAULT_PAGE_SIZE }} />}
          >
            Cancel
          </Button>
        }
      />

      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[7fr_minmax(13rem,3fr)_4fr]">
          <FormPanel title="Pool">
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <form.Field name="name">
                {(field) => (
                  <Field label="Name" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="symbol">
                {(field) => (
                  <Field label="Symbol" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value.toUpperCase())}
                      aria-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                      className="font-mono uppercase"
                      maxLength={6}
                    />
                  </Field>
                )}
              </form.Field>
            </div>
            <form.Field name="description">
              {(field) => (
                <Field label="Description" htmlFor={field.name} error={fieldError(field)}>
                  <Textarea
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
                    maxLength={500}
                    rows={3}
                    className="min-h-16"
                  />
                </Field>
              )}
            </form.Field>
          </FormPanel>

          {/* Hidden where the upload service is not configured: a deploy is still
              publishable without images, and a control that cannot work is worse
              than its absence.

              Dense fields, in a card of its own: the row's height is set by the
              pool card beside it, and the labelled variant would stretch all
              three cards to fit prose this card has no room for. */}
          {isStorageConfigured ? (
            <FormPanel title="Images">
              <form.Field name="imageUrl">
                {(field) => (
                  <ImageUploadField
                    label="Logo"
                    hint="Optional"
                    purpose="pool.image"
                    value={field.state.value === "" ? null : field.state.value}
                    onChange={(url) => field.handleChange(url ?? "")}
                    disabled={deployment.publishing}
                    dense
                  />
                )}
              </form.Field>

              <form.Field name="bannerUrl">
                {(field) => (
                  <ImageUploadField
                    label="Banner"
                    hint="Optional"
                    purpose="pool.banner"
                    value={field.state.value === "" ? null : field.state.value}
                    onChange={(url) => field.handleChange(url ?? "")}
                    disabled={deployment.publishing}
                    dense
                  />
                )}
              </form.Field>
            </FormPanel>
          ) : null}

          <FormPanel title="Pricing and fees">
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="pricing">
                {(field) => (
                  <Field label="Pricing" htmlFor={field.name} error={fieldError(field)}>
                    <Select
                      items={PRICING_OPTIONS}
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value === "oracle" || value === "decimal") {
                          field.handleChange(value);
                        }
                      }}
                    >
                      <SelectTrigger
                        id={field.name}
                        className="w-full"
                        aria-invalid={
                          field.state.meta.isTouched && field.state.meta.errors.length > 0
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICING_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.pricing}>
                {(pricing) =>
                  pricing === "oracle" ? (
                    <form.Field name="oracleBase">
                      {(field) => (
                        <Field
                          label="Oracle base currency"
                          htmlFor={field.name}
                          error={fieldError(field)}
                        >
                          <Select
                            items={ORACLE_OPTIONS}
                            value={field.state.value}
                            onValueChange={(value) => {
                              if (value && isOracleBase(value)) field.handleChange(value);
                            }}
                          >
                            <SelectTrigger id={field.name} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ORACLE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
              <form.Field name="feePolicyDefault">
                {(field) => (
                  <Field label="Default fee (%)" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      inputMode="decimal"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                      className="font-data"
                    />
                  </Field>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.feePolicyDefault}>
                {(feePolicyDefault) =>
                  Number(feePolicyDefault) > 0 ? (
                    <form.Field name="feesDecoupled">
                      {(field) => (
                        <div className="flex items-end pb-0.5">
                          <label
                            htmlFor={field.name}
                            className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              id={field.name}
                              checked={field.state.value}
                              onCheckedChange={(checked) => field.handleChange(checked === true)}
                            />
                            Hold fees separately
                          </label>
                        </div>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
            </div>
          </FormPanel>

          <FormPanel title="Directory">
            <form.Field name="locationName">
              {(nameField) => (
                <form.Field name="latitude">
                  {(latitudeField) => (
                    <form.Field name="longitude">
                      {(longitudeField) => (
                        <LocationField
                          name={nameField.state.value}
                          latitude={latitudeField.state.value}
                          longitude={longitudeField.state.value}
                          nameError={fieldError(nameField)}
                          coordinateError={fieldError(latitudeField) ?? fieldError(longitudeField)}
                          onNameChange={nameField.handleChange}
                          onNameBlur={nameField.handleBlur}
                          onCoordinatesChange={(nextLatitude, nextLongitude) => {
                            latitudeField.handleChange(nextLatitude);
                            longitudeField.handleChange(nextLongitude);
                          }}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Field>
              )}
            </form.Field>
            <form.Field name="tags">
              {(field) => (
                <Field label="Tags" error={fieldError(field)}>
                  {tokenTags.isPending ? (
                    <p className="text-muted-foreground text-sm">Loading tags…</p>
                  ) : tokenTags.isError ? (
                    <p className="text-muted-foreground text-sm">Tags are unavailable.</p>
                  ) : (
                    <TagCombobox
                      items={tokenTags.data ?? []}
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      searchLabel="Search pool tags"
                      selectedLabel="Selected pool tags"
                      listLabel="Pool tags"
                      placeholder="Search tags"
                      removeLabel={(tag) => `Remove ${tag}`}
                    />
                  )}
                </Field>
              )}
            </form.Field>
          </FormPanel>

          <FormPanel title="Contact" className="xl:col-span-2">
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="email">
                {(field) => (
                  <Field label="Email" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="phone">
                {(field) => (
                  <Field label="Phone" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      inputMode="tel"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                      className="font-data"
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="website">
                {(field) => (
                  <Field label="Website" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      type="url"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="terms">
                {(field) => (
                  <Field label="Terms URL" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      type="url"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={
                        field.state.meta.isTouched && field.state.meta.errors.length > 0
                      }
                    />
                  </Field>
                )}
              </form.Field>
            </div>
          </FormPanel>
        </div>

        <aside className="border-border bg-card h-fit border p-4 xl:sticky xl:top-20">
          <SectionHeading className="mb-4">Deployment</SectionHeading>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <>
                <dl className="-mx-1.5">
                  <BoundRow label="Owner" value={formatVoucherAddress(owner as `0x${string}`)} />
                  <BoundRow label="Name" value={values.name} />
                  <BoundRow label="Symbol" value={values.symbol} />
                  <BoundRow label="Description" value={values.description} />
                  <BoundRow
                    label="Pricing"
                    value={
                      PRICING_OPTIONS.find((option) => option.value === values.pricing)?.label ??
                      values.pricing
                    }
                  />
                  {values.pricing === "oracle" ? (
                    <BoundRow label="Oracle base" value={values.oracleBase} />
                  ) : null}
                  <BoundRow label="Fee" value={`${values.feePolicyDefault}%`} />
                  {Number(values.feePolicyDefault) > 0 ? (
                    <BoundRow
                      label="Hold fees"
                      value={values.feesDecoupled ? "Separately" : "In liquidity"}
                    />
                  ) : null}
                  <BoundRow label="Location" value={values.locationName} />
                  <BoundRow
                    label="Pin"
                    value={
                      values.latitude.trim() && values.longitude.trim()
                        ? `${Number(values.latitude).toFixed(5)}, ${Number(values.longitude).toFixed(5)}`
                        : ""
                    }
                  />
                  <BoundRow label="Tags" value={values.tags.join(", ")} />
                  <BoundRow label="Email" value={values.email} />
                  <BoundRow label="Phone" value={values.phone} />
                  <BoundRow label="Website" value={values.website} />
                  <BoundRow label="Terms" value={values.terms} />
                </dl>
                {deployment.started ? (
                  <ul className="mt-4 space-y-1.5" aria-label="Deployment status">
                    {deployment.stages.map((stage) => (
                      <li
                        key={stage.label}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span
                          className={stage.state === "idle" ? "text-muted-foreground" : undefined}
                        >
                          {stage.label}
                        </span>
                        <span
                          className={`font-mono text-[10px] tracking-wide uppercase ${
                            stage.state === "failed" ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {stage.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {deployment.errorMessage ? (
                  <p role="alert" className="text-destructive mt-4 text-xs">
                    {deployment.errorMessage}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  className="mt-5 w-full"
                  disabled={!poolPublishSchema.safeParse(values).success || deployment.publishing}
                >
                  {deployment.publishing ? (
                    <>
                      <FiLoader className="animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    "Publish pool"
                  )}
                </Button>
              </>
            )}
          </form.Subscribe>
        </aside>
      </form>
    </div>
  );
}

function FormPanel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`border-border bg-card flex flex-col gap-3 border p-4 ${className ?? ""}`}>
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}

function fieldError(field: {
  state: { meta: { isTouched: boolean; errors: Array<unknown> } };
}): string | null {
  if (!field.state.meta.isTouched) return null;
  return getFieldError(field.state.meta.errors as Parameters<typeof getFieldError>[0]);
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{label}</Label>
      ) : (
        <p className="text-xs leading-none">{label}</p>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BoundRow({ label, value }: { label: string; value: string }) {
  const empty = value.trim() === "";
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-1.5 py-1 ${
        empty ? "bg-destructive/10" : ""
      }`}
    >
      <dt className={`text-xs ${empty ? "text-destructive" : "text-muted-foreground"}`}>{label}</dt>
      <dd
        aria-label={label}
        className={`font-data min-w-0 truncate text-right text-xs ${
          empty ? "text-destructive" : ""
        }`}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}
