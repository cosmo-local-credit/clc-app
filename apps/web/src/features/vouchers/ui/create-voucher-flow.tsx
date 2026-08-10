import type { LocationInput } from "@clc/core/features/location/logic";
import {
  toVoucherDeployPayload,
  voucherCreateSchema,
  voucherDecimalsSchema,
  voucherDescriptionSchema,
  voucherEmailSchema,
  voucherExpiryDateSchema,
  voucherLocationSchema,
  voucherNameSchema,
  voucherPhoneSchema,
  voucherSymbolSchema,
  voucherTermsSchema,
  voucherValueSchema,
} from "@clc/core/features/vouchers/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiArrowRightSLine, RiCoupon2Line, RiLoader4Line } from "react-icons/ri";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PhoneInputField } from "#/components/ui/phone-input";
import { Progress } from "#/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { BackendApiError, formatBackendApiError } from "#/features/auth/api/client";
import { useDeployVoucher, useVoucherTags } from "#/features/vouchers/hooks/use-voucher-deployment";
import {
  beginVoucherCreateHistory,
  exitVoucherCreateHistory,
} from "#/lib/navigation/voucher-create-history";
import { translateValidationError } from "#/lib/validation-i18n";

export type VoucherCreateStep = "voucher" | "place" | "review";

type VoucherFormValues = {
  name: string;
  symbol: string;
  voucherValue: string;
  voucherUoa: "KES" | "USD" | "HOUR";
  description: string;
  voucherType: "standard" | "expiring";
  expiryDate: string;
  decimals: string;
  location: LocationInput | undefined;
  tags: string[];
  email: string;
  phone: string;
  acceptedTerms: boolean;
};

const DEFAULT_VALUES: VoucherFormValues = {
  name: "",
  symbol: "",
  voucherValue: "1",
  voucherUoa: "KES",
  description: "",
  voucherType: "standard",
  expiryDate: "",
  decimals: "6",
  location: undefined,
  tags: [],
  email: "",
  phone: "",
  acceptedTerms: false,
};

const DETAIL_FIELDS = [
  "name",
  "symbol",
  "voucherValue",
  "description",
  "expiryDate",
  "decimals",
] as const;
const PLACE_FIELDS = ["location", "email", "phone"] as const;

export function CreateVoucherFlow({ step }: { step: VoucherCreateStep }) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address } = useConnection();
  const deployVoucher = useDeployVoucher();
  const tagsQuery = useVoucherTags(step !== "voucher");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onSubmit: voucherCreateSchema },
    onSubmit: async ({ value }) => {
      if (!address) {
        toast.error(t`Connect your wallet before publishing.`);
        return;
      }
      const parsed = voucherCreateSchema.parse(value);
      try {
        const result = await deployVoucher.mutateAsync(
          toVoucherDeployPayload(parsed, getAddress(address)),
        );
        exitVoucherCreateHistory({
          history: router.history,
          destination: `/vouchers/create/receipt?trackingId=${encodeURIComponent(result.trackingId)}`,
        });
      } catch (error) {
        toast.error(
          error instanceof BackendApiError
            ? formatBackendApiError(error)
            : error instanceof Error
              ? error.message
              : t`Couldn't publish your voucher.`,
        );
      }
    },
  });

  useEffect(() => {
    if (step === "voucher") beginVoucherCreateHistory(router.history);
  }, [router.history, step]);

  useEffect(() => {
    if (step === "voucher") return;
    if (voucherNameSchema.safeParse(form.getFieldValue("name")).success) return;
    void navigate({
      to: "/vouchers/create/$step",
      params: { step: "voucher" },
      replace: true,
    });
  }, [form, navigate, step]);

  async function fieldsAreValid(fields: readonly (keyof VoucherFormValues)[]) {
    const results = await Promise.all(
      fields.map((field) => Promise.resolve(form.validateField(field, "submit"))),
    );
    return results.every((errors) => errors.length === 0);
  }

  async function goToPlace() {
    if (!(await fieldsAreValid(DETAIL_FIELDS))) return;
    void navigate({ to: "/vouchers/create/$step", params: { step: "place" } });
  }

  async function goToReview() {
    if (!(await fieldsAreValid(PLACE_FIELDS))) return;
    void navigate({ to: "/vouchers/create/$step", params: { step: "review" } });
  }

  const progressStep = step === "voucher" ? 1 : step === "place" ? 2 : 3;
  const fallbackTo =
    step === "review"
      ? "/vouchers/create/place"
      : step === "place"
        ? "/vouchers/create/voucher"
        : "/wallet/vouchers";

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron
        label={step === "voucher" ? t`Vouchers` : t`Back`}
        to={fallbackTo}
        className="self-start"
      />

      <div className="mb-[1.125rem] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <Progress value={(progressStep / 3) * 100} aria-label={t`Step ${progressStep} of 3`} />
        <span className="text-muted-foreground text-xs tabular-nums">
          {progressStep} <Trans>of 3</Trans>
        </span>
      </div>

      <form
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (step === "review") void form.handleSubmit();
        }}
      >
        {step === "voucher" ? (
          <>
            <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
              <Trans>Your voucher</Trans>
            </h1>

            <div className="mt-3.5 grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <RiCoupon2Line className="mt-0.5 size-4" aria-hidden="true" />
              <p>
                <strong className="block font-semibold">
                  <Trans>What's a voucher?</Trans>
                </strong>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  <Trans>
                    A voucher acts like a gift card for your offers. When someone redeems your
                    voucher, you are committing to provide them with your offers.
                  </Trans>
                </span>
              </p>
            </div>

            <div className="mt-3.5 space-y-3.5">
              <form.Field
                name="name"
                validators={{ onBlur: voucherNameSchema, onSubmit: voucherNameSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Voucher Name`}
                    htmlFor="voucher-name"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-name"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t`e.g. Amina's Voucher`}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field
                name="symbol"
                validators={{ onBlur: voucherSymbolSchema, onSubmit: voucherSymbolSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Voucher Symbol`}
                    htmlFor="voucher-symbol"
                    hint={t`Short ticker, max 6 characters`}
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-symbol"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value.toUpperCase())}
                      onBlur={field.handleBlur}
                      placeholder={t`e.g. AMINA`}
                      maxLength={6}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2.5">
                <form.Field
                  name="voucherValue"
                  validators={{ onBlur: voucherValueSchema, onSubmit: voucherValueSchema }}
                >
                  {(field) => (
                    <Field
                      label={t`Voucher Value`}
                      htmlFor="voucher-value"
                      error={getFieldError(field.state.meta.errors)}
                    >
                      <Input
                        id="voucher-value"
                        inputMode="decimal"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="voucherUoa">
                  {(field) => (
                    <Field label={t`Unit of Account`} htmlFor="voucher-unit">
                      <SelectRoot
                        value={field.state.value}
                        onValueChange={(value) => {
                          if (value === "KES" || value === "USD" || value === "HOUR") {
                            field.handleChange(value);
                          }
                        }}
                      >
                        <SelectTrigger
                          id="voucher-unit"
                          className="w-full rounded-none bg-card shadow-none focus-visible:ring-0"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none shadow-none">
                          <SelectItem value="KES">KES</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="HOUR">HOUR</SelectItem>
                        </SelectContent>
                      </SelectRoot>
                    </Field>
                  )}
                </form.Field>
              </div>
              <p className="-mt-2 text-muted-foreground text-xs">
                <Trans>KES worth of goods &amp; services</Trans>
              </p>

              <form.Field
                name="description"
                validators={{
                  onBlur: voucherDescriptionSchema,
                  onSubmit: voucherDescriptionSchema,
                }}
              >
                {(field) => (
                  <Field
                    label={t`Voucher Description`}
                    htmlFor="voucher-description"
                    hint={t`Shown on your voucher page`}
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Textarea
                      id="voucher-description"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t`Tell people about your business...`}
                      maxLength={500}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-1 bg-card px-2 text-left font-medium text-muted-foreground text-sm"
                aria-expanded={advancedOpen}
                aria-controls="voucher-advanced"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <RiArrowRightSLine
                  className={`size-4 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
                <Trans>Advanced</Trans>
              </button>

              {advancedOpen ? (
                <div id="voucher-advanced" className="space-y-3.5 border-t border-border pt-3.5">
                  <form.Field name="voucherType">
                    {(field) => (
                      <div>
                        <p className="mb-2 font-medium text-sm">
                          <Trans>Voucher Type</Trans>
                        </p>
                        <RadioGroup
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (value === "standard" || value === "expiring") {
                              field.handleChange(value);
                            }
                          }}
                          aria-label={t`Voucher Type`}
                          className="gap-2.5"
                        >
                          <VoucherTypeOption
                            value="standard"
                            title={t`Standard`}
                            description={t`Circulates forever`}
                          />
                          <VoucherTypeOption
                            value="expiring"
                            title={t`Expiring`}
                            description={t`Has an expiration date`}
                          />
                        </RadioGroup>
                      </div>
                    )}
                  </form.Field>

                  <form.Field
                    name="expiryDate"
                    validators={{
                      onBlur: voucherExpiryDateSchema(form.getFieldValue("voucherType")),
                      onSubmit: voucherExpiryDateSchema(form.getFieldValue("voucherType")),
                    }}
                  >
                    {(field) => (
                      <Field
                        label={t`Expiration Date`}
                        htmlFor="voucher-expiry"
                        hint={t`When does this voucher expire?`}
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="voucher-expiry"
                          type="date"
                          disabled={form.getFieldValue("voucherType") !== "expiring"}
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="decimals"
                    validators={{ onBlur: voucherDecimalsSchema, onSubmit: voucherDecimalsSchema }}
                  >
                    {(field) => (
                      <Field
                        label={t`Decimals`}
                        htmlFor="voucher-decimals"
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="voucher-decimals"
                          inputMode="numeric"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                      </Field>
                    )}
                  </form.Field>
                </div>
              ) : null}
            </div>

            <div className="mt-auto pt-6">
              <Button type="button" className="h-11 w-full" onClick={() => void goToPlace()}>
                <Trans>Next</Trans>
              </Button>
            </div>
          </>
        ) : null}

        {step === "place" ? (
          <>
            <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
              <Trans>Where and what for</Trans>
            </h1>

            <div className="mt-3.5 space-y-3.5">
              <form.Field name="location" validators={{ onSubmit: voucherLocationSchema }}>
                {(field) => (
                  <LocationPicker
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value)}
                    error={
                      getFieldError(field.state.meta.errors)
                        ? translateValidationError(
                            getFieldError(field.state.meta.errors) ?? "",
                            i18n,
                          )
                        : undefined
                    }
                  />
                )}
              </form.Field>

              <form.Field name="tags">
                {(field) => (
                  <div>
                    <p className="font-medium text-sm">
                      <Trans>Tags</Trans>
                    </p>
                    {tagsQuery.isPending ? (
                      <p className="mt-1.5 text-muted-foreground text-xs">
                        <Trans>Loading tags…</Trans>
                      </p>
                    ) : null}
                    {tagsQuery.isError ? (
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <p className="text-destructive text-xs">
                          <Trans>Couldn't load voucher tags.</Trans>
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="bg-card"
                          onClick={() => tagsQuery.refetch()}
                        >
                          <Trans>Retry</Trans>
                        </Button>
                      </div>
                    ) : null}
                    {tagsQuery.data?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tagsQuery.data.map((tag) => {
                          const selected = field.state.value.includes(tag);
                          return (
                            <Button
                              key={tag}
                              type="button"
                              size="sm"
                              variant="outline"
                              aria-pressed={selected}
                              className={
                                selected
                                  ? "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                                  : "bg-card text-muted-foreground"
                              }
                              onClick={() =>
                                field.handleChange(
                                  selected
                                    ? field.state.value.filter((value) => value !== tag)
                                    : [...field.state.value, tag],
                                )
                              }
                            >
                              {tag}
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                    <p className="mt-1.5 text-muted-foreground text-xs">
                      <Trans>Helps buyers find and trust your offer</Trans>
                    </p>
                  </div>
                )}
              </form.Field>

              <form.Field
                name="email"
                validators={{ onBlur: voucherEmailSchema, onSubmit: voucherEmailSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Contact Email`}
                    htmlFor="voucher-email"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-email"
                      type="email"
                      autoComplete="email"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="you@example.com"
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field
                name="phone"
                validators={{ onBlur: voucherPhoneSchema, onSubmit: voucherPhoneSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Contact Phone`}
                    htmlFor="voucher-phone"
                    hint={t`Public — voucher holders will see this so they can reach you.`}
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <PhoneInputField
                      id="voucher-phone"
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>
            </div>

            <div className="mt-auto pt-6">
              <Button type="button" className="h-11 w-full" onClick={() => void goToReview()}>
                <Trans>Next</Trans>
              </Button>
            </div>
          </>
        ) : null}

        {step === "review" ? (
          <>
            <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
              <Trans>Confirm &amp; publish</Trans>
            </h1>

            <div className="mt-3.5 rounded-xl border border-border bg-card px-4 py-1.5">
              <ReviewRow label={t`Name`} value={form.getFieldValue("name")} />
              <ReviewRow label={t`Symbol`} value={form.getFieldValue("symbol")} />
              <ReviewRow
                label={t`Value`}
                value={`${form.getFieldValue("voucherValue")} ${form.getFieldValue("voucherUoa")}`}
              />
              <ReviewRow
                label={t`Type`}
                value={form.getFieldValue("voucherType") === "expiring" ? t`Expiring` : t`Standard`}
                muted
              />
              <ReviewRow
                label={t`Location`}
                value={form.getFieldValue("location")?.locationName ?? "—"}
              />
              <ReviewRow
                label={t`Tags`}
                value={form.getFieldValue("tags").join(", ") || "—"}
                muted
                last
              />
            </div>

            <form.Field name="acceptedTerms" validators={{ onSubmit: voucherTermsSchema }}>
              {(field) => {
                const error = getFieldError(field.state.meta.errors);
                return (
                  <div className="mt-3.5">
                    <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-2.5 text-xs leading-relaxed">
                      <Checkbox
                        id="voucher-terms"
                        checked={field.state.value}
                        onCheckedChange={(checked) => field.handleChange(checked)}
                        aria-invalid={!!error}
                        className="mt-0.5"
                      />
                      <span>
                        <strong className="block font-medium text-foreground">
                          <Trans>Accept Terms and Conditions</Trans>
                        </strong>
                        <span className="text-muted-foreground">
                          <Trans>You agree to our Terms of Service and Privacy Policy</Trans>
                        </span>
                      </span>
                    </label>
                    {error ? <FieldError error={error} /> : null}
                  </div>
                );
              }}
            </form.Field>

            <div className="mt-auto pt-6">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={isSubmitting || deployVoucher.isPending}
                  >
                    {isSubmitting || deployVoucher.isPending ? (
                      <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {isSubmitting || deployVoucher.isPending ? (
                      <Trans>Publishing…</Trans>
                    ) : (
                      <Trans>Confirm &amp; Publish</Trans>
                    )}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block font-medium text-sm">
        {label}
      </label>
      {children}
      {error ? (
        <FieldError error={error} />
      ) : hint ? (
        <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

function FieldError({ error }: { error: string }) {
  const { i18n } = useLingui();
  return (
    <p className="mt-1 text-destructive text-xs" role="alert">
      {translateValidationError(error, i18n)}
    </p>
  );
}

function VoucherTypeOption({
  value,
  title,
  description,
}: {
  value: "standard" | "expiring";
  title: string;
  description: string;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] gap-3 rounded-xl border border-border bg-card p-3 has-data-[checked]:border-primary has-data-[checked]:bg-primary/[0.05]">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <strong className="block text-sm font-semibold">{title}</strong>
        <span className="mt-0.5 block text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}

function ReviewRow({
  label,
  value,
  muted = false,
  last = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`grid min-h-10 grid-cols-[minmax(0,6rem)_minmax(0,1fr)] items-center gap-3 py-2 text-sm ${last ? "" : "border-b border-border"}`}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`break-words text-right font-medium ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
