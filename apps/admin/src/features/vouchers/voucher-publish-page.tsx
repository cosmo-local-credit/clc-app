import { tokenTagsQueryOptions } from "@clc/api/features/deployments/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { markerColorSchema, markerIconSchema } from "@clc/core/features/markers/logic";
import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";
import {
  voucherDescriptionSchema,
  voucherNameSchema,
  voucherPriceSchema,
  voucherSymbolSchema,
  voucherUnitSchema,
} from "@clc/core/features/vouchers/logic";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsSchema,
  optionalWebsiteSchema,
} from "@clc/core/lib/contact";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { storedImageUrlSchema } from "@clc/core/lib/image-url";
import { tokenDecimalsSchema } from "@clc/core/lib/token";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FiLoader } from "react-icons/fi";
import { toast } from "sonner";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { ImageUploadField } from "#/components/admin/image-upload-field";
import { LocationField } from "#/components/admin/location-field";
import { PageHeader } from "#/components/admin/page-header";
import { MarkerStyleField, describeMarker } from "#/components/admin/marker-style-field";
import { SectionHeading } from "#/components/admin/section-heading";
import { Button } from "#/components/ui/button";
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
import { useAdminSession } from "#/features/auth/admin-session";
import { clcApi } from "#/lib/api";
import { isStorageConfigured } from "#/lib/storage";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";

import { useVoucherPublishDeployment } from "./use-voucher-publish-deployment";
import { UnitOfAccountCombobox } from "#/components/admin/unit-of-account-combobox";

const TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "expiring", label: "Expiring" },
] as const;

/**
 * Coordinates are required even though the deploy request treats them as
 * optional. `list-market-vouchers` selects `WHERE v.active AND v.geo_lat IS NOT
 * NULL`, so a voucher published without a pin is deployed, indexed, and then
 * invisible to every catalog read — including this console's own list.
 */
const requiredCoordinateSchema = z
  .string()
  .trim()
  .min(1, { message: "Drop a pin on the map" })
  .refine((value) => Number.isFinite(Number(value)), { message: "Enter a number" });

/**
 * The owner is editable here and fixed on the pool form, and the difference is
 * the product's: a pool belongs to the platform that runs it, while a voucher
 * belongs to the service provider who honours it. That provider owns the token
 * from the deploy transaction onward — `mintTo` is `onlyWriter` — so this address
 * decides who can issue supply, and nobody can hand it over afterwards.
 */
const ownerSchema = z
  .string()
  .trim()
  .min(1, { message: "Owner is required" })
  .refine(isWalletAddress, { message: "Enter a valid wallet address" });

/**
 * `isAddress` is a type guard, and a guard inside `refine` narrows the schema's
 * output to `0x${string}` — which makes the form's value type disagree with the
 * `string` its input holds. Boolean, so the schema stays a schema over strings.
 *
 * Non-strict because the operator is typing: a lowercase address is a valid
 * address, and it is checksummed on the way to clc-core rather than being
 * rejected here for the case of its letters.
 */
function isWalletAddress(value: string): boolean {
  return isAddress(value, { strict: false });
}

const voucherPublishSchema = z
  .object({
    name: voucherNameSchema,
    symbol: voucherSymbolSchema,
    description: voucherDescriptionSchema,
    owner: ownerSchema,
    decimals: tokenDecimalsSchema,
    unitOfAccount: voucherUnitSchema,
    price: voucherPriceSchema,
    voucherType: z.enum(["standard", "expiring"]),
    expiryDate: z.string(),
    locationName: z
      .string()
      .trim()
      .min(1, { message: "Location is required" })
      .max(160, { message: "Location must be 160 characters or fewer" }),
    latitude: requiredCoordinateSchema,
    longitude: requiredCoordinateSchema,
    tags: z.array(z.string()).min(1, { message: "Select at least one tag" }),
    // Optional, exactly as clc-core and the member app treat them: an issuer
    // reachable only through the pool that lists them is a real case, and a
    // console that refuses to publish one is refusing to record what exists.
    email: optionalEmailSchema,
    website: optionalWebsiteSchema,
    phone: optionalPhoneSchema,
    terms: optionalTermsSchema,
    // Already uploaded by the time they reach the form — the field uploads on
    // selection — so these hold a stored URL or nothing. clc-core validates them
    // as http(s) before it queues the deploy, because the catalog column that
    // receives them refuses anything else, and refusing it in the worker would
    // mean a signed transaction with no catalog row.
    iconUrl: storedImageUrlSchema,
    bannerUrl: storedImageUrlSchema,
    markerIcon: markerIconSchema.nullable(),
    markerColor: markerColorSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.voucherType === "expiring") {
      const expiry = Date.parse(`${value.expiryDate}T00:00:00Z`);
      if (!value.expiryDate || !Number.isFinite(expiry)) {
        ctx.addIssue({
          code: "custom",
          path: ["expiryDate"],
          message: "Choose an expiration date",
        });
      } else if (expiry <= Date.now()) {
        ctx.addIssue({
          code: "custom",
          path: ["expiryDate"],
          message: "Expiration date must be in the future",
        });
      }
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

type VoucherPublishValues = z.infer<typeof voucherPublishSchema>;

function defaultValues(owner: string): VoucherPublishValues {
  return {
    name: "",
    symbol: "",
    description: "",
    owner,
    decimals: "6",
    unitOfAccount: "KES",
    price: "1",
    voucherType: "standard",
    expiryDate: "",
    locationName: "",
    latitude: "",
    longitude: "",
    tags: [],
    email: "",
    website: "",
    phone: "",
    terms: "",
    iconUrl: "",
    bannerUrl: "",
    markerIcon: null,
    markerColor: null,
  };
}

/**
 * Publishes a voucher: the console's half of the same deploy the member app
 * performs, with the metadata that app hides.
 *
 * The deployment queue owns contract creation. This form only collects the input
 * `POST /api/v2/contracts/token` accepts and sends it there; it never pretends
 * the console can separately write an address, a supply, or an owner change.
 *
 * A voucher deploys with **zero supply** — `initialize()` only assigns ownership,
 * and the platform signer keeps no minting authority — so publishing here creates
 * a voucher its owner must then mint against from their own wallet. That is not a
 * gap in this screen: the console holds no key that could mint for them.
 */
export function VoucherPublishPage() {
  const session = useAdminSession();

  if (session.status !== "authenticated") {
    return <p className="text-muted-foreground text-sm">Operator session is unavailable.</p>;
  }

  // The operator's address is a form *default*, so it has to be known before the
  // form exists — TanStack Form reads defaultValues once. The session is resolved
  // in a parent so the address cannot arrive after initialisation and leave the
  // owner field blank.
  return <VoucherPublishForm operator={session.operator.address} />;
}

function VoucherPublishForm({ operator }: { operator: string }) {
  const tokenTags = useQuery(tokenTagsQueryOptions(clcApi.deployments));
  const deployment = useVoucherPublishDeployment();

  const form = useForm({
    defaultValues: defaultValues(operator),
    validators: { onChange: voucherPublishSchema, onSubmit: voucherPublishSchema },
    onSubmit: async ({ value }) => {
      const owner = value.owner.trim();
      if (!isWalletAddress(owner)) {
        toast.error("Enter a valid owner address.");
        return;
      }

      const expiryTimestamp =
        value.voucherType === "expiring"
          ? String(Math.floor(Date.parse(`${value.expiryDate}T00:00:00Z`) / 1_000))
          : undefined;

      const payload: VoucherDeployPayload = {
        name: value.name.trim(),
        symbol: value.symbol.trim(),
        decimals: value.decimals.trim(),
        // clc-core validates `eth_addr_checksum`, so a lowercase address typed in
        // by hand has to be checksummed here or the deploy is a 400.
        owner: getAddress(owner),
        ...(expiryTimestamp ? { expiryTimestamp } : {}),
        description: value.description.trim(),
        voucherUoa: value.unitOfAccount,
        voucherValue: Number(value.price),
        locationName: value.locationName.trim(),
        geoLat: Number(value.latitude.trim()),
        geoLng: Number(value.longitude.trim()),
        // Omitted when unset rather than sent empty: the deploy request treats
        // every one of these as optional, and an empty string is not a URL.
        ...(value.email.trim() ? { email: value.email.trim() } : {}),
        ...(value.website.trim() ? { website: value.website.trim() } : {}),
        ...(value.phone.trim() ? { phone: value.phone.trim() } : {}),
        ...(value.terms.trim() ? { terms: value.terms.trim() } : {}),
        ...(value.iconUrl ? { iconUrl: value.iconUrl } : {}),
        ...(value.bannerUrl ? { bannerUrl: value.bannerUrl } : {}),
        ...(value.markerIcon ? { markerIcon: value.markerIcon } : {}),
        ...(value.markerColor ? { markerColor: value.markerColor } : {}),
        tags: value.tags,
      };

      try {
        await deployment.publish(payload);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not publish this voucher.");
      }
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <AppBreadcrumb items={[{ label: "Vouchers", to: "/vouchers" }, { label: "Publish" }]} />
        }
        title="Publish voucher"
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/vouchers" search={{ perPage: DEFAULT_PAGE_SIZE }} />}
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
          <FormPanel title="Voucher">
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
            <form.Field name="owner">
              {(field) => (
                <Field label="Owner" htmlFor={field.name} error={fieldError(field)}>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
                    className="font-data"
                    spellCheck={false}
                  />
                </Field>
              )}
            </form.Field>
          </FormPanel>

          {/* Hidden where the upload service is not configured: a deploy is still
              publishable without images, and a control that cannot work is worse
              than its absence. Dense fields in a card of their own, because the
              row's height is set by the voucher card beside it. */}
          {isStorageConfigured ? (
            <FormPanel title="Images">
              <form.Field name="iconUrl">
                {(field) => (
                  <ImageUploadField
                    label="Icon"
                    hint="Optional"
                    purpose="voucher.icon"
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
                    purpose="voucher.banner"
                    value={field.state.value === "" ? null : field.state.value}
                    onChange={(url) => field.handleChange(url ?? "")}
                    disabled={deployment.publishing}
                    dense
                  />
                )}
              </form.Field>
            </FormPanel>
          ) : null}

          <FormPanel title="Value and supply">
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="unitOfAccount">
                {(field) => (
                  <Field label="Unit of account" htmlFor={field.name} error={fieldError(field)}>
                    <UnitOfAccountCombobox
                      id={field.name}
                      value={field.state.value}
                      onValueChange={field.handleChange}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="price">
                {(field) => (
                  <Field label="Value per unit" htmlFor={field.name} error={fieldError(field)}>
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
              <form.Field name="decimals">
                {(field) => (
                  <Field label="Decimals" htmlFor={field.name} error={fieldError(field)}>
                    <Input
                      id={field.name}
                      inputMode="numeric"
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
              <form.Field name="voucherType">
                {(field) => (
                  <Field label="Type" htmlFor={field.name} error={fieldError(field)}>
                    <Select
                      items={TYPE_OPTIONS}
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value === "standard" || value === "expiring") {
                          field.handleChange(value);
                        }
                      }}
                    >
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.voucherType}>
                {(voucherType) =>
                  voucherType === "expiring" ? (
                    <form.Field name="expiryDate">
                      {(field) => (
                        <Field
                          label="Expires on"
                          htmlFor={field.name}
                          error={fieldError(field)}
                          className="col-span-2"
                        >
                          <Input
                            id={field.name}
                            type="date"
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
                      searchLabel="Search voucher tags"
                      selectedLabel="Selected voucher tags"
                      listLabel="Voucher tags"
                      placeholder="Search tags"
                      removeLabel={(tag) => `Remove ${tag}`}
                    />
                  )}
                </Field>
              )}
            </form.Field>
            <form.Subscribe
              selector={(state) => [state.values.markerIcon, state.values.markerColor] as const}
            >
              {([icon, color]) => (
                <Field label="Map marker" error={null}>
                  {/* A new voucher has no offerings, so its default pin is the voucher's. */}
                  <MarkerStyleField
                    kind="voucher"
                    value={{ icon, color }}
                    onChange={(next) => {
                      form.setFieldValue("markerIcon", next.icon);
                      form.setFieldValue("markerColor", next.color);
                    }}
                  />
                </Field>
              )}
            </form.Subscribe>
          </FormPanel>

          <FormPanel title="Issuer contact" className="xl:col-span-2">
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
                  <Field htmlFor={field.name} label="Terms" error={fieldError(field)}>
                    <Textarea
                      id={field.name}
                      rows={3}
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
                  <BoundRow
                    label="Owner"
                    value={
                      isWalletAddress(values.owner.trim())
                        ? formatVoucherAddress(getAddress(values.owner.trim()))
                        : values.owner
                    }
                  />
                  <BoundRow label="Name" value={values.name} />
                  <BoundRow label="Symbol" value={values.symbol} />
                  <BoundRow label="Description" value={values.description} />
                  <BoundRow label="Value" value={`${values.price} ${values.unitOfAccount}`} />
                  <BoundRow label="Decimals" value={values.decimals} />
                  <BoundRow
                    label="Voucher type"
                    value={
                      TYPE_OPTIONS.find((option) => option.value === values.voucherType)?.label ??
                      values.voucherType
                    }
                  />
                  {values.voucherType === "expiring" ? (
                    <BoundRow label="Expires" value={values.expiryDate} />
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
                  <BoundRow
                    label="Map marker"
                    value={describeMarker("voucher", {
                      icon: values.markerIcon,
                      color: values.markerColor,
                    })}
                  />
                  <BoundRow label="Email" value={values.email} optional />
                  <BoundRow label="Phone" value={values.phone} optional />
                  <BoundRow label="Website" value={values.website} optional />
                  <BoundRow label="Terms" value={values.terms} optional />
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
                {/* A voucher lands with no supply, and the console holds no key
                    that could mint for its owner. Saying so on the card is the
                    only place an operator finds out before they are asked why the
                    voucher they just published cannot be sent. */}
                <p className="text-muted-foreground mt-4 text-xs leading-snug">
                  Deploys with zero supply. The owner creates their opening supply from their own
                  wallet.
                </p>
                <Button
                  type="submit"
                  className="mt-3 w-full"
                  disabled={
                    !voucherPublishSchema.safeParse(values).success || deployment.publishing
                  }
                >
                  {deployment.publishing ? (
                    <>
                      <FiLoader className="animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    "Publish voucher"
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
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error: string | null;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
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
      ) : hint ? (
        <p className="text-muted-foreground text-xs leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * One bound value, flagged when it is missing.
 *
 * `optional` exists because a voucher's contact block genuinely is: the pool form
 * requires all four, so every empty row there is a blocker worth colouring red.
 * Colouring an optional row red would report a problem the submit button
 * disagrees with.
 */
function BoundRow({
  label,
  value,
  optional,
}: {
  label: string;
  value: string;
  optional?: boolean;
}) {
  const empty = value.trim() === "";
  const missing = empty && !optional;
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-1.5 py-1 ${
        missing ? "bg-destructive/10" : ""
      }`}
    >
      <dt className={`text-xs ${missing ? "text-destructive" : "text-muted-foreground"}`}>
        {label}
      </dt>
      <dd
        aria-label={label}
        className={`font-data min-w-0 truncate text-right text-xs ${
          missing ? "text-destructive" : ""
        }`}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}
