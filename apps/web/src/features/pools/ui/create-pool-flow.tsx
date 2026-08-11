import { type LocationInput, locationSchema } from "@clc/core/features/location/logic";
import {
  type PoolCreateInput,
  PoolOracleUnavailableError,
  type PoolPricing,
  poolCreateSchema,
  poolDeploymentContractCount,
  poolDescriptionSchema,
  poolNameSchema,
  poolSproutLicenseSchema,
  poolSwapFeeSchema,
  poolSymbolSchema,
  poolTermsSchema,
  poolUnitSchemaForPricing,
  toPoolDeployPayload,
} from "@clc/core/features/pools/logic";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalWebsiteSchema,
} from "@clc/core/lib/contact";
import { CELO_MAINNET_CHAIN_ID } from "@clc/core/lib/constants/celo";
import { tokenDecimalsSchema } from "@clc/core/lib/token";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { RiLoader4Line } from "react-icons/ri";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { AgreementField } from "#/components/ui/agreement-field";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
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
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { BackendApiError, formatBackendApiError } from "#/features/auth/api/client";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useDeployPool } from "#/features/pools/hooks/use-pool-deployment";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useTokenTags } from "#/hooks/use-deployment";
import {
  beginPoolCreateHistory,
  exitPoolCreateHistory,
} from "#/lib/navigation/pool-create-history";
import { translateValidationError } from "#/lib/validation-i18n";
import { PoolDetailsRows } from "./pool-details-rows";

export type PoolCreateStep = "pool" | "place" | "review";

type PoolFormValues = Omit<
  PoolCreateInput,
  "location" | "acceptedTerms" | "acceptedSproutLicense"
> & {
  location: LocationInput | undefined;
  acceptedTerms: boolean;
  acceptedSproutLicense: boolean;
};

const DEFAULT_VALUES: PoolFormValues = {
  name: "",
  symbol: "",
  unit: "KES",
  description: "",
  pricing: "oracle",
  feePolicyDefault: "1",
  feesDecoupled: false,
  decimals: "6",
  location: undefined,
  tags: [],
  email: "",
  website: "",
  phone: "",
  acceptedTerms: false,
  acceptedSproutLicense: false,
};

const DETAIL_FIELDS = [
  "name",
  "symbol",
  "unit",
  "description",
  "feePolicyDefault",
  "decimals",
] as const;
const PLACE_FIELDS = ["location", "email", "website", "phone"] as const;

export function CreatePoolFlow({ step }: { step: PoolCreateStep }) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address, chainId } = useConnection();
  const deployPool = useDeployPool();
  const tagsQuery = useTokenTags();
  const profileQuery = useAuthProfile();
  const draft = usePoolCreateDraft((state) => state.draft);
  const setDraft = usePoolCreateDraft((state) => state.setDraft);
  const hasPrefilledProfile = useRef(false);

  // The store is a submitted-value retry snapshot, not live draft persistence. A fresh mount after
  // receipt failure is what causes TanStack Form to consume these defaults again.
  const form = useForm({
    defaultValues: draft ?? DEFAULT_VALUES,
    validators: { onSubmit: poolCreateSchema },
    onSubmit: async ({ value }) => {
      if (!address || chainId === undefined) {
        toast.error(t`Connect your wallet before publishing.`);
        return;
      }
      const parsed = poolCreateSchema.parse(value);
      setDraft(parsed);
      try {
        const result = await deployPool.mutateAsync(
          toPoolDeployPayload(parsed, getAddress(address), chainId),
        );
        exitPoolCreateHistory({
          history: router.history,
          destination: `/pools/create/receipt?trackingId=${encodeURIComponent(result.trackingId)}`,
        });
      } catch (error) {
        toast.error(
          error instanceof BackendApiError
            ? formatBackendApiError(error)
            : error instanceof PoolOracleUnavailableError
              ? t`The selected unit does not have a configured price feed.`
              : error instanceof Error
                ? error.message
                : t`Couldn't publish your pool.`,
        );
      }
    },
  });

  useEffect(() => {
    const profile = profileQuery.data;
    if (hasPrefilledProfile.current || !profile || draft) return;
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
  }, [draft, form, profileQuery.data]);

  useEffect(() => {
    if (step === "pool") beginPoolCreateHistory(router.history);
  }, [router.history, step]);

  useEffect(() => {
    if (step === "pool") return;
    if (poolNameSchema.safeParse(form.getFieldValue("name")).success) return;
    void navigate({ to: "/pools/create/$step", params: { step: "pool" }, replace: true });
  }, [form, navigate, step]);

  async function fieldsAreValid(fields: readonly (keyof PoolFormValues)[]) {
    const results = await Promise.all(
      fields.map((field) => Promise.resolve(form.validateField(field, "submit"))),
    );
    return results.every((errors) => errors.length === 0);
  }

  async function goToPlace() {
    if (!(await fieldsAreValid(DETAIL_FIELDS))) return;
    void navigate({ to: "/pools/create/$step", params: { step: "place" } });
  }

  async function goToReview() {
    if (!(await fieldsAreValid(PLACE_FIELDS))) return;
    void navigate({ to: "/pools/create/$step", params: { step: "review" } });
  }

  const progressStep = step === "pool" ? 1 : step === "place" ? 2 : 3;
  const fallbackTo =
    step === "review" ? "/pools/create/place" : step === "place" ? "/pools/create/pool" : "/pools/";

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron
        label={step === "pool" ? t`Pools` : t`Back`}
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
        {step === "pool" ? (
          <>
            <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
              <Trans>Create pool</Trans>
            </h1>

            <aside
              className="mt-3.5 border border-info/30 bg-card"
              aria-labelledby="pool-guidance-title"
            >
              <p
                id="pool-guidance-title"
                className="border-info/20 border-b bg-info/[0.08] px-4 py-2.5 font-semibold text-info text-sm leading-tight"
              >
                <Trans>What's a pool?</Trans>
              </p>
              <p className="px-4 py-3 text-muted-foreground text-sm leading-snug">
                <Trans>
                  A pool holds vouchers together so members can swap between them at a published
                  value.
                </Trans>
              </p>
            </aside>

            <div className="mt-3.5 space-y-3.5">
              <form.Field
                name="name"
                validators={{ onBlur: poolNameSchema, onSubmit: poolNameSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Pool Name`}
                    htmlFor="pool-name"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="pool-name"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t`Enter pool name`}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field
                name="symbol"
                validators={{ onBlur: poolSymbolSchema, onSubmit: poolSymbolSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Pool Shortcode`}
                    htmlFor="pool-symbol"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="pool-symbol"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value.toUpperCase())}
                      onBlur={field.handleBlur}
                      placeholder={t`Enter pool shortcode, eg. ABC1`}
                      maxLength={6}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.pricing}>
                {(pricing) => (
                  <form.Field
                    name="unit"
                    validators={{
                      onBlur: poolUnitSchemaForPricing(pricing, chainId ?? CELO_MAINNET_CHAIN_ID),
                      onSubmit: poolUnitSchemaForPricing(pricing, chainId ?? CELO_MAINNET_CHAIN_ID),
                    }}
                  >
                    {(field) => (
                      <Field
                        label={t`Unit of Account`}
                        htmlFor="pool-unit"
                        hint={t`The unit used for pricing in this pool (e.g., USD, KES, HOUR)`}
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <SelectRoot
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (value === "KES" || value === "USD" || value === "HOUR") {
                              field.handleChange(value);
                            }
                          }}
                        >
                          <SelectTrigger id="pool-unit" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="KES">KES - Kenyan Shilling</SelectItem>
                            <SelectItem value="USD">USD - US Dollar</SelectItem>
                            <SelectItem value="HOUR">HOUR</SelectItem>
                          </SelectContent>
                        </SelectRoot>
                      </Field>
                    )}
                  </form.Field>
                )}
              </form.Subscribe>

              <form.Field
                name="description"
                validators={{
                  onBlur: poolDescriptionSchema,
                  onSubmit: poolDescriptionSchema,
                }}
              >
                {(field) => (
                  <Field
                    label={t`Pool Description`}
                    htmlFor="pool-description"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Textarea
                      id="pool-description"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t`Describe your pool`}
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
                  id="pool-advanced"
                  className="mt-4 space-y-3.5 border border-border bg-card p-4"
                >
                  <form.Field name="pricing">
                    {(field) => (
                      <div>
                        <p className="mb-2 font-medium text-sm">
                          <Trans>Pricing</Trans>
                        </p>
                        <RadioGroup
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (value === "oracle" || value === "relative" || value === "decimal") {
                              field.handleChange(value);
                            }
                          }}
                          aria-label={t`Pricing`}
                          className="gap-2.5"
                        >
                          <PricingOption
                            value="oracle"
                            title={t`Price feed`}
                            description={t`Follows the selected unit's feed`}
                            isDefault
                          />
                          <PricingOption
                            value="relative"
                            title={t`Rates you set`}
                            description={t`You set a rate per voucher`}
                          />
                          <PricingOption
                            value="decimal"
                            title={t`Equal value`}
                            description={t`Vouchers swap one for one`}
                          />
                        </RadioGroup>
                      </div>
                    )}
                  </form.Field>

                  <form.Field
                    name="feePolicyDefault"
                    validators={{ onBlur: poolSwapFeeSchema, onSubmit: poolSwapFeeSchema }}
                  >
                    {(field) => (
                      <Field
                        label={t`Swap Fee (%)`}
                        htmlFor="pool-swap-fee"
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="pool-swap-fee"
                          inputMode="decimal"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="feesDecoupled">
                    {(field) => (
                      <label
                        htmlFor="pool-fees-decoupled"
                        className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                      >
                        <span>
                          <strong className="block font-medium text-sm">
                            <Trans>Take fees separately</Trans>
                          </strong>
                          <span className="mt-0.5 block text-muted-foreground text-xs">
                            <Trans>Fees are held apart from pool liquidity</Trans>
                          </span>
                        </span>
                        <Switch
                          id="pool-fees-decoupled"
                          checked={field.state.value}
                          onCheckedChange={(checked) => field.handleChange(checked)}
                        />
                      </label>
                    )}
                  </form.Field>

                  <form.Field
                    name="decimals"
                    validators={{ onBlur: tokenDecimalsSchema, onSubmit: tokenDecimalsSchema }}
                  >
                    {(field) => (
                      <Field
                        label={t`Decimals`}
                        htmlFor="pool-decimals"
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="pool-decimals"
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
                      label={t`Pool Location`}
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
                      <Trans>Pool Tags</Trans>
                    </p>
                    {tagsQuery.isPending ? (
                      <p className="mt-1.5 text-muted-foreground text-xs">
                        <Trans>Loading tags…</Trans>
                      </p>
                    ) : null}
                    {tagsQuery.isError ? (
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <p className="text-destructive text-xs">
                          <Trans>Couldn't load pool tags.</Trans>
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
                        searchLabel={t`Search pool tags`}
                        selectedLabel={t`Selected pool tags`}
                        listLabel={t`Pool tags`}
                        placeholder={t`Search tags`}
                        removeLabel={(tag) => t`Remove ${tag}`}
                      />
                    ) : null}
                    <p className="mt-1.5 text-muted-foreground text-xs">
                      <Trans>Helps members find and understand your pool</Trans>
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
                    htmlFor="pool-email"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="pool-email"
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
                name="website"
                validators={{ onBlur: optionalWebsiteSchema, onSubmit: optionalWebsiteSchema }}
              >
                {(field) => (
                  <Field
                    label={t`Contact Website`}
                    htmlFor="pool-website"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="pool-website"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="https://example.com"
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
                    htmlFor="pool-phone"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <PhoneInputField
                      id="pool-phone"
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
                  <PoolDetailsRows values={values} />
                </dl>
              )}
            </form.Subscribe>

            <div className="mt-3.5 space-y-3">
              <form.Field name="acceptedTerms" validators={{ onSubmit: poolTermsSchema }}>
                {(field) => (
                  <AgreementField
                    id="pool-terms"
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
                name="acceptedSproutLicense"
                validators={{ onSubmit: poolSproutLicenseSchema }}
              >
                {(field) => (
                  <AgreementField
                    id="pool-sprout-license"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Trans>Accept</Trans>{" "}
                    <a
                      href="https://docs.grassecon.org/commons/sprout/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Trans>SPROUT License</Trans>
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
                    state.values.pricing,
                    state.values.acceptedTerms,
                    state.values.acceptedSproutLicense,
                  ] as const
                }
              >
                {([isSubmitting, pricing, acceptedTerms, acceptedSproutLicense]) => (
                  <>
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={
                        !acceptedTerms ||
                        !acceptedSproutLicense ||
                        isSubmitting ||
                        deployPool.isPending
                      }
                    >
                      {isSubmitting || deployPool.isPending ? (
                        <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      {isSubmitting || deployPool.isPending ? (
                        <Trans>Publishing…</Trans>
                      ) : (
                        <Trans>Confirm &amp; Publish</Trans>
                      )}
                    </Button>
                    <p className="mt-2 text-center text-muted-foreground text-xs">
                      <Trans>Publishes {poolDeploymentContractCount(pricing)} contracts</Trans>
                    </p>
                  </>
                )}
              </form.Subscribe>
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
}

function PricingOption({
  value,
  title,
  description,
  isDefault = false,
}: {
  value: PoolPricing;
  title: string;
  description: string;
  isDefault?: boolean;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] gap-3 border border-border bg-card p-3 has-data-[checked]:border-primary has-data-[checked]:bg-primary/[0.05]">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-semibold">{title}</strong>
          {isDefault ? (
            <Badge variant="muted" className="h-5 px-2 text-[10px]">
              <Trans>Default</Trans>
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 block text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}
