import { type LocationInput, locationSchema } from "@clc/core/features/location/logic";
import {
  toVoucherDeployPayload,
  type VoucherType,
  type VoucherUnit,
  voucherCreateSchema,
  voucherDescriptionSchema,
  voucherExpiryDateSchema,
  voucherNameSchema,
  voucherPathLicenseSchema,
  voucherPriceSchema,
  voucherSymbolSchema,
  voucherTermsSchema,
} from "@clc/core/features/vouchers/logic";
import { optionalEmailSchema, optionalPhoneSchema } from "@clc/core/lib/contact";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { tokenDecimalsSchema } from "@clc/core/lib/token";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { RiLoader4Line } from "react-icons/ri";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { AgreementField } from "#/components/ui/agreement-field";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { InfoRow } from "#/components/ui/info-row";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PhoneInputField } from "#/components/ui/phone-input";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { StepProgress } from "#/components/ui/step-progress";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { BackendApiError, formatBackendApiError } from "#/features/auth/api/client";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useDeployVoucher } from "#/features/vouchers/hooks/use-voucher-deployment";
import { useTokenTags } from "#/hooks/use-deployment";
import {
  beginVoucherCreateHistory,
  exitVoucherCreateHistory,
} from "#/lib/navigation/voucher-create-history";
import { translateValidationError } from "#/lib/validation-i18n";

export type VoucherCreateStep = "voucher" | "place" | "review";

type VoucherFormValues = {
  name: string;
  symbol: string;
  price: string;
  unitOfAccount: VoucherUnit;
  description: string;
  voucherType: VoucherType;
  expiryDate: string;
  decimals: string;
  location: LocationInput | undefined;
  tags: string[];
  email: string;
  phone: string;
  acceptedTerms: boolean;
  acceptedPathLicense: boolean;
};

const DEFAULT_VALUES: VoucherFormValues = {
  name: "",
  symbol: "",
  price: "1",
  unitOfAccount: "KES",
  description: "",
  voucherType: "standard",
  expiryDate: "",
  decimals: "6",
  location: undefined,
  tags: [],
  email: "",
  phone: "",
  acceptedTerms: false,
  acceptedPathLicense: false,
};

const DETAIL_FIELDS = ["name", "symbol", "price", "description", "expiryDate", "decimals"] as const;
const PLACE_FIELDS = ["location", "email", "phone"] as const;

export function CreateVoucherFlow({ step }: { step: VoucherCreateStep }) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address } = useConnection();
  const deployVoucher = useDeployVoucher();
  const tagsQuery = useTokenTags();
  const profileQuery = useAuthProfile();
  const hasPrefilledProfile = useRef(false);

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
    const profile = profileQuery.data;
    if (hasPrefilledProfile.current || !profile) return;
    hasPrefilledProfile.current = true;

    const email = profile.email.trim();
    if (
      !form.getFieldMeta("email")?.isTouched &&
      form.getFieldValue("email") === "" &&
      !email.endsWith("@clc.local")
    ) {
      form.setFieldValue("email", email, { dontUpdateMeta: true });
    }

    const phone = profile.phone.trim();
    if (!form.getFieldMeta("phone")?.isTouched && form.getFieldValue("phone") === "") {
      form.setFieldValue("phone", phone, { dontUpdateMeta: true });
    }
  }, [form, profileQuery.data]);

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

      <StepProgress step={progressStep} total={3} />

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
              <Trans>Create voucher</Trans>
            </h1>

            <aside
              className="mt-3.5 border border-border bg-card p-4"
              aria-labelledby="voucher-guidance-title"
            >
              <p id="voucher-guidance-title" className="font-semibold text-sm leading-tight">
                <Trans>What's a voucher?</Trans>
              </p>
              <p className="mt-1 text-muted-foreground text-sm leading-snug">
                <Trans>
                  A voucher acts like a gift card for your offers. When someone redeems your
                  voucher, you are committing to provide them with your offers.
                </Trans>
              </p>
            </aside>

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
                      placeholder={t`e.g. Community Market`}
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
                      placeholder={t`e.g. MARKET`}
                      maxLength={6}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.unitOfAccount}>
                {(unit) => (
                  <div
                    data-slot="voucher-pricing-row"
                    className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-2.5"
                  >
                    <form.Field
                      name="price"
                      validators={{ onBlur: voucherPriceSchema, onSubmit: voucherPriceSchema }}
                    >
                      {(field) => (
                        <Field
                          label={t`Price`}
                          htmlFor="voucher-price"
                          error={getFieldError(field.state.meta.errors)}
                        >
                          <div className="relative">
                            <Input
                              id="voucher-price"
                              inputMode="decimal"
                              className="pr-16"
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              onBlur={field.handleBlur}
                              aria-invalid={field.state.meta.errors.length > 0}
                            />
                            <span
                              data-slot="voucher-price-unit"
                              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm"
                              aria-hidden="true"
                            >
                              {unit}
                            </span>
                          </div>
                        </Field>
                      )}
                    </form.Field>

                    <form.Field name="unitOfAccount">
                      {(field) => (
                        <Field label={t`Priced in`} htmlFor="voucher-currency">
                          <SelectRoot
                            value={field.state.value}
                            onValueChange={(value) => {
                              if (value === "KES" || value === "USD" || value === "HOUR") {
                                field.handleChange(value);
                              }
                            }}
                          >
                            <SelectTrigger id="voucher-currency" className="w-full">
                              <SelectValue>{() => field.state.value}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="KES">
                                <Trans>KES — Kenyan shilling</Trans>
                              </SelectItem>
                              <SelectItem value="USD">
                                <Trans>USD — US dollar</Trans>
                              </SelectItem>
                              <SelectItem value="HOUR">
                                <Trans>HOUR — Hour</Trans>
                              </SelectItem>
                            </SelectContent>
                          </SelectRoot>
                        </Field>
                      )}
                    </form.Field>
                  </div>
                )}
              </form.Subscribe>

              <form.Subscribe
                selector={(state) =>
                  [state.values.symbol, state.values.price, state.values.unitOfAccount] as const
                }
              >
                {([symbol, price, unit]) => (
                  <p className="-mt-2 font-mono text-muted-foreground text-xs tabular-nums">
                    {`1 ${symbol.trim() || "XYZ"} = ${price || "—"} ${unit}`}
                  </p>
                )}
              </form.Subscribe>

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

              <details>
                <summary className="cursor-pointer font-medium text-foreground text-sm">
                  <Trans>Advanced</Trans>
                </summary>

                <div
                  id="voucher-advanced"
                  className="mt-4 space-y-3.5 border border-border bg-card p-4"
                >
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

                  {/* Subscribed, not read via getFieldValue: the validator and conditional
                      field both have to follow the live voucher type. */}
                  <form.Subscribe selector={(state) => state.values.voucherType}>
                    {(voucherType) =>
                      voucherType === "expiring" ? (
                        <form.Field
                          name="expiryDate"
                          validators={{
                            onBlur: voucherExpiryDateSchema(voucherType),
                            onSubmit: voucherExpiryDateSchema(voucherType),
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
                                value={field.state.value}
                                onChange={(event) => field.handleChange(event.target.value)}
                                onBlur={field.handleBlur}
                                aria-invalid={field.state.meta.errors.length > 0}
                              />
                            </Field>
                          )}
                        </form.Field>
                      ) : null
                    }
                  </form.Subscribe>

                  <form.Field
                    name="decimals"
                    validators={{ onBlur: tokenDecimalsSchema, onSubmit: tokenDecimalsSchema }}
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
              </details>
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
              <form.Field name="location" validators={{ onSubmit: locationSchema }}>
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <LocationPicker
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                      error={error ? translateValidationError(error, i18n) : undefined}
                    />
                  );
                }}
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
                      <TagCombobox
                        items={tagsQuery.data}
                        value={field.state.value}
                        onValueChange={field.handleChange}
                        searchLabel={t`Search voucher tags`}
                        selectedLabel={t`Selected voucher tags`}
                        listLabel={t`Voucher tags`}
                        placeholder={t`Search tags`}
                        removeLabel={(tag) => t`Remove ${tag}`}
                      />
                    ) : null}
                    <p className="mt-1.5 text-muted-foreground text-xs">
                      <Trans>Helps buyers find and trust your offer</Trans>
                    </p>
                  </div>
                )}
              </form.Field>

              <form.Field
                name="email"
                validators={{ onBlur: optionalEmailSchema, onSubmit: optionalEmailSchema }}
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
                validators={{ onBlur: optionalPhoneSchema, onSubmit: optionalPhoneSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Contact Phone`}
                    htmlFor="voucher-phone"
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

            <form.Subscribe selector={(state) => state.values}>
              {(values) => (
                <dl className="mt-3.5 border border-border bg-card">
                  <InfoRow label={t`Name`}>{values.name}</InfoRow>
                  <InfoRow label={t`Symbol`}>{values.symbol}</InfoRow>
                  <InfoRow label={t`Price`}>
                    {values.price} {values.unitOfAccount}
                  </InfoRow>
                  <InfoRow label={t`Type`} muted>
                    {values.voucherType === "expiring" ? t`Expiring` : t`Standard`}
                  </InfoRow>
                  <InfoRow label={t`Location`}>{values.location?.locationName ?? "—"}</InfoRow>
                  <InfoRow label={t`Tags`} muted>
                    {values.tags.join(", ") || "—"}
                  </InfoRow>
                </dl>
              )}
            </form.Subscribe>

            <div className="mt-3.5 space-y-3">
              <form.Field name="acceptedTerms" validators={{ onSubmit: voucherTermsSchema }}>
                {(field) => (
                  <AgreementField
                    id="voucher-terms"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Trans>Accept</Trans>{" "}
                    <a
                      href="https://grassecon.org/pages/terms-and-conditions"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Trans>Terms and Conditions</Trans>
                    </a>
                  </AgreementField>
                )}
              </form.Field>

              <form.Field
                name="acceptedPathLicense"
                validators={{ onSubmit: voucherPathLicenseSchema }}
              >
                {(field) => (
                  <AgreementField
                    id="voucher-path-license"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Trans>Accept</Trans>{" "}
                    <a
                      href="https://docs.grassecon.org/commons/path/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Trans>PATH License</Trans>
                    </a>
                  </AgreementField>
                )}
              </form.Field>
            </div>

            <div className="mt-auto pt-6">
              <form.Subscribe
                selector={(state) =>
                  [
                    state.isSubmitting,
                    state.values.acceptedTerms,
                    state.values.acceptedPathLicense,
                  ] as const
                }
              >
                {([isSubmitting, acceptedTerms, acceptedPathLicense]) => (
                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={
                      !acceptedTerms ||
                      !acceptedPathLicense ||
                      isSubmitting ||
                      deployVoucher.isPending
                    }
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

function VoucherTypeOption({
  value,
  title,
  description,
}: {
  value: VoucherType;
  title: string;
  description: string;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] gap-3 border border-border bg-card p-3 has-data-[checked]:border-primary has-data-[checked]:bg-primary/[0.05]">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <strong className="block text-sm font-semibold">{title}</strong>
        <span className="mt-0.5 block text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}
