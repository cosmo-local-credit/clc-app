import { type LocationInput, locationSchema } from "@clc/core/features/location/logic";
import {
  type PoolCreateInput,
  PoolOracleUnavailableError,
  type PoolPricing,
  chainHasPoolOracle,
  hasPoolOracleBaseCurrency,
  poolCreateSchemaForChain,
  poolDeploymentContractCount,
  poolDescriptionSchema,
  poolFeeAddressSchema,
  poolNameSchema,
  poolSwapFeeSchema,
  poolSymbolSchema,
  poolTermsSchema,
  poolUnitSchemaForPricing,
  toPoolDeployPayload,
} from "@clc/core/features/pools/logic";
import {
  isHttpUrl,
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsTextSchema,
  optionalTermsUrlSchema,
  optionalWebsiteSchema,
  TERMS_TEXT_MAX,
} from "@clc/core/lib/contact";
import { profilePrefill } from "@clc/core/features/signup/prefill";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { findUnitOfAccountOption } from "@clc/core/lib/currencies";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldError } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { PhoneInputField } from "#/components/ui/phone-input";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { StepProgress } from "#/components/ui/step-progress";
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { RecipientAddressInput } from "#/components/wallet/recipient-address-input";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useDeployPool } from "#/features/pools/hooks/use-pool-deployment";
import { ResourceUsage } from "#/components/resource-usage";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useTokenTags } from "#/hooks/use-deployment";
import { useNameAvailabilityValidator } from "#/hooks/use-name-availability";
import { useSuggestedSymbol } from "#/hooks/use-suggested-symbol";
import { isStorageConfigured } from "#/lib/api/storage";
import { CHAIN_ID } from "#/lib/chain";
import {
  beginPoolCreateHistory,
  exitPoolCreateHistory,
} from "#/lib/navigation/pool-create-history";
import { translateValidationError } from "#/lib/validation-i18n";
import { PoolDetailsRows } from "./pool-details-rows";

export type PoolCreateStep = "pool" | "place" | "review";

type PoolFormValues = Omit<PoolCreateInput, "location" | "acceptedTerms"> & {
  location: LocationInput | undefined;
  /** Form-only: whether `terms` is a link or the terms themselves. */
  termsMode: "url" | "text";
  acceptedTerms: boolean;
};

const DEFAULT_VALUES: PoolFormValues = {
  name: "",
  symbol: "",
  unitOfAccount: "KES",
  description: "",
  pricing: "relative",
  feePolicyDefault: "0",
  feesDecoupled: false,
  feeAddress: "",
  location: undefined,
  tags: [],
  email: "",
  website: "",
  phone: "",
  terms: "",
  termsMode: "url",
  imageUrl: "",
  acceptedTerms: false,
};

/** The text fields a saved profile can seed, all of which default to "". */
type SeedableTextField = "name" | "email" | "phone" | "website" | "description" | "imageUrl";

const DETAIL_FIELDS = [
  "name",
  "symbol",
  "unitOfAccount",
  "description",
  "feePolicyDefault",
] as const;
/** Detail fields folded under "Advanced"; an error there has to unfold it to be seen. */
const ADVANCED_FIELDS = ["symbol", "feePolicyDefault"] as const;
const PLACE_FIELDS = ["location", "email", "website", "phone", "terms", "imageUrl"] as const;

export function CreatePoolFlow({ step }: { step: PoolCreateStep }) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address, chainId } = useConnection();
  // Pre-connect the form still has to validate, so it assumes the chain this
  // build was configured for — which is the one the wallet will connect to.
  const activeChainId = chainId ?? CHAIN_ID;
  const hasOracle = chainHasPoolOracle(activeChainId);
  const defaultPricing: PoolPricing = "relative";
  const poolCreateSchema = poolCreateSchemaForChain(activeChainId);
  const deployPool = useDeployPool();
  const usage = useResourceUsage();
  const tagsQuery = useTokenTags();
  const profileQuery = useAuthProfile();
  const draft = usePoolCreateDraft((state) => state.draft);
  const setDraft = usePoolCreateDraft((state) => state.setDraft);
  const hasPrefilledProfile = useRef(false);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const suggestedSymbol = useSuggestedSymbol({ kind: "pool", initialSymbol: draft?.symbol ?? "" });
  const checkNameAvailable = useNameAvailabilityValidator("pool");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // The store is a submitted-value retry snapshot, not live draft persistence. A fresh mount after
  // receipt failure is what causes TanStack Form to consume these defaults again.
  const form = useForm({
    defaultValues: draft
      ? {
          ...draft,
          termsMode: draft.terms && !isHttpUrl(draft.terms) ? "text" : "url",
        }
      : { ...DEFAULT_VALUES, pricing: defaultPricing },
    validators: {
      // The form-only terms mode is deliberately absent from the persisted
      // create input, so translate the Standard Schema issues by field.
      onSubmit: ({ value }) => {
        const result = poolCreateSchema.safeParse(value);
        if (result.success) return undefined;
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = issue.path.map(String).join(".");
          if (key !== "" && !(key in fields)) fields[key] = issue.message;
        }
        return { fields };
      },
    },
    onSubmit: async ({ value }) => {
      if (usage.isError || !usage.data?.pools.canCreate) return;
      if (!address || chainId === undefined) {
        toast.error(t`Connect your wallet before publishing.`);
        return;
      }
      const check = await suggestedSymbol.confirm(value.name, value.symbol);
      if (!check.ok) {
        toast.error(t`That symbol is already in use.`);
        return;
      }
      if (check.symbol !== value.symbol) {
        form.setFieldValue("symbol", check.symbol);
        toast.info(t`Symbol was taken, using ${check.symbol} instead.`);
      }
      const parsed = poolCreateSchema.parse({ ...value, symbol: check.symbol });
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
        if (error instanceof BackendApiError && error.code === "E11") {
          toast.error(t`Limit reached. Ask an administrator to increase your allowance.`);
          return;
        }
        // See create-voucher-flow: the availability check is advisory, so the
        // name can be taken between step 1 and publish.
        if (error instanceof BackendApiError && error.kind === "conflict") {
          toast.error(t`That pool name was taken while you were filling this in.`);
          void navigate({ to: "/pools/create/$step", params: { step: "pool" } });
          void form.validateField("name", "submit");
          return;
        }
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

  // A steward already gave all of this during onboarding, so the form starts
  // from it. Only an untouched field still holding its default is seeded — a
  // retry draft, or anything typed over, always wins.
  useEffect(() => {
    const profile = profileQuery.data;
    if (hasPrefilledProfile.current || !profile || draft) return;
    hasPrefilledProfile.current = true;

    const prefill = profilePrefill(profile);

    function seedText(name: SeedableTextField, value: string) {
      if (!value) return;
      if (form.getFieldMeta(name)?.isTouched) return;
      if (form.getFieldValue(name) !== "") return;
      form.setFieldValue(name, value, { dontUpdateMeta: true });
    }

    seedText("email", prefill.email);
    seedText("phone", prefill.phone);
    seedText("website", prefill.website);
    seedText("name", prefill.name ? `${prefill.name} Pool` : "");
    // The bio is free text with no minimum, so it only becomes a description
    // when it would pass as one.
    if (poolDescriptionSchema.safeParse(prefill.description).success) {
      seedText("description", prefill.description);
    }
    // Only where the upload fields are rendered: seeding a hidden field would
    // attach a photo the steward was never shown.
    if (isStorageConfigured) seedText("imageUrl", prefill.imageUrl);

    // A pool unit is the narrower set, and under oracle pricing it also has to
    // be one this chain has a feed for — so the preference is offered to the
    // same schema the field itself validates against rather than assumed.
    const preferredUnit = poolUnitSchemaForPricing(
      form.getFieldValue("pricing"),
      activeChainId,
    ).safeParse(prefill.unitOfAccount);
    if (
      preferredUnit.success &&
      !form.getFieldMeta("unitOfAccount")?.isTouched &&
      form.getFieldValue("unitOfAccount") === DEFAULT_VALUES.unitOfAccount
    ) {
      form.setFieldValue("unitOfAccount", preferredUnit.data, { dontUpdateMeta: true });
    }

    if (
      prefill.location &&
      !form.getFieldMeta("location")?.isTouched &&
      form.getFieldValue("location") === undefined
    ) {
      form.setFieldValue("location", prefill.location, { dontUpdateMeta: true });
    }
  }, [activeChainId, draft, form, profileQuery.data]);

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

  /**
   * Writes the derived symbol into the still-empty field.
   *
   * Called both when "Advanced" unfolds and on the way out of the step: the
   * field is only ever looked at from inside the disclosure, so a suggestion
   * that arrives at Next is one the user never sees being made.
   */
  async function fillSuggestedSymbol() {
    if (form.getFieldValue("symbol") !== "") return;
    const symbol = await suggestedSymbol.suggest(form.getFieldValue("name"));
    if (symbol) form.setFieldValue("symbol", symbol);
  }

  async function goToPlace() {
    // The symbol lookup and the name check reach the backend, so Next waits
    // visibly rather than looking dead.
    setAdvancing(true);
    try {
      // Blur may not have fired, or its lookup may still be in flight.
      await fillSuggestedSymbol();
      if (!(await fieldsAreValid(DETAIL_FIELDS))) {
        if (ADVANCED_FIELDS.some((field) => (form.getFieldMeta(field)?.errors.length ?? 0) > 0)) {
          if (advancedRef.current) advancedRef.current.open = true;
        }
        return;
      }
    } finally {
      setAdvancing(false);
    }
    void navigate({ to: "/pools/create/$step", params: { step: "place" } });
  }

  async function goToReview() {
    if (logoBusy) return;
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
        onClick={step === "place" && tagsOpen ? () => setTagsOpen(false) : undefined}
        className="self-start"
      />

      <StepProgress step={progressStep} total={3} />
      <ResourceUsage resource="pools" />

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
                asyncDebounceMs={400}
                validators={{
                  onBlur: poolNameSchema,
                  onSubmit: poolNameSchema,
                  onChangeAsync: checkNameAvailable,
                  onSubmitAsync: checkNameAvailable,
                }}
              >
                {(field) => (
                  <Field
                    label={t`Pool Name`}
                    htmlFor="pool-name"
                    error={getFieldError(field.state.meta.errors)}
                    hint={field.state.meta.isValidating ? t`Checking availability…` : undefined}
                  >
                    <Input
                      id="pool-name"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={() => {
                        field.handleBlur();
                        void suggestedSymbol.suggest(field.state.value).then((symbol) => {
                          if (symbol !== undefined) form.setFieldValue("symbol", symbol);
                        });
                      }}
                      placeholder={t`Enter pool name`}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.pricing}>
                {(pricing) => (
                  <form.Field
                    name="unitOfAccount"
                    validators={{
                      onBlur: poolUnitSchemaForPricing(pricing, activeChainId),
                      onSubmit: poolUnitSchemaForPricing(pricing, activeChainId),
                    }}
                  >
                    {(field) => (
                      <Field
                        label={t`Unit of Account`}
                        htmlFor="pool-unit"
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <UnitOfAccountCombobox
                          id="pool-unit"
                          value={field.state.value}
                          onValueChange={(unit) => {
                            field.handleChange(unit);
                            if (
                              form.getFieldValue("pricing") === "oracle" &&
                              !hasPoolOracleBaseCurrency(unit, activeChainId)
                            ) {
                              form.setFieldValue("pricing", "relative");
                            }
                          }}
                          placeholder={t`Search units of account`}
                          emptyMessage={t`No units of account found`}
                        />
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

              <details
                ref={advancedRef}
                onToggle={(event) => {
                  if (event.currentTarget.open) void fillSuggestedSymbol();
                }}
              >
                <summary className="cursor-pointer font-medium text-foreground text-sm">
                  <Trans>Advanced</Trans>
                </summary>

                <div
                  id="pool-advanced"
                  className="mt-4 space-y-3.5 border border-border bg-card p-4"
                >
                  <form.Field
                    name="symbol"
                    validators={{ onBlur: poolSymbolSchema, onSubmit: poolSymbolSchema }}
                  >
                    {(field) => (
                      <Field
                        label={t`Pool symbol`}
                        htmlFor="pool-symbol"
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="pool-symbol"
                          value={field.state.value}
                          onChange={(event) => {
                            const symbol = event.target.value.toUpperCase();
                            field.handleChange(symbol);
                            suggestedSymbol.track(symbol);
                          }}
                          onBlur={field.handleBlur}
                          placeholder={t`Enter pool symbol, eg. ABC1`}
                          maxLength={6}
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="pricing">
                    {(field) => (
                      <div>
                        <p className="mb-2 font-medium text-sm">
                          <Trans>Pricing</Trans>
                        </p>
                        <RadioGroup
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (value === "relative" || value === "oracle" || value === "decimal") {
                              field.handleChange(value);
                            }
                          }}
                          aria-label={t`Pricing`}
                          className="gap-2.5"
                        >
                          <PricingOption
                            value="relative"
                            title={t`Relative pricing`}
                            description={t`Uses voucher rates set for this pool`}
                            isDefault
                          />
                          <PricingOption
                            value="decimal"
                            title={t`Equal value`}
                            description={t`Vouchers swap one for one`}
                          />
                          {hasOracle ? (
                            <PricingOption
                              value="oracle"
                              title={t`Oracle pricing`}
                              description={t`Follows live price feeds for the selected currency`}
                              disabled={
                                !hasPoolOracleBaseCurrency(
                                  form.getFieldValue("unitOfAccount"),
                                  activeChainId,
                                )
                              }
                            />
                          ) : null}
                          {!findUnitOfAccountOption(form.getFieldValue("unitOfAccount")) ? (
                            <p className="text-muted-foreground text-xs">
                              <Trans>
                                Custom units have no price feed. Relative pricing is used instead.
                              </Trans>
                            </p>
                          ) : null}
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
                          dir="ltr"
                          inputMode="decimal"
                          value={field.state.value}
                          onChange={(event) => {
                            const fee = event.target.value;
                            field.handleChange(fee);
                            if (Number(fee) > 0) {
                              // The recipient starts as the connected wallet,
                              // which is where the pool pays fees when nothing
                              // else is named. Seeded, not bound: a steward who
                              // typed another address keeps it.
                              if (address && form.getFieldValue("feeAddress") === "") {
                                form.setFieldValue("feeAddress", getAddress(address), {
                                  dontUpdateMeta: true,
                                });
                              }
                              return;
                            }
                            form.setFieldValue("feesDecoupled", false, {
                              dontUpdateMeta: true,
                            });
                            form.setFieldValue("feeAddress", "", { dontUpdateMeta: true });
                          }}
                          onBlur={field.handleBlur}
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Subscribe selector={(state) => state.values.feePolicyDefault}>
                    {(feePolicyDefault) =>
                      Number(feePolicyDefault) > 0 ? (
                        <form.Field name="feesDecoupled">
                          {(field) => (
                            <label
                              htmlFor="pool-fees-decoupled"
                              className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                            >
                              <strong className="block font-medium text-sm">
                                <Trans>Take fees separately</Trans>
                              </strong>
                              <Checkbox
                                id="pool-fees-decoupled"
                                checked={field.state.value}
                                onCheckedChange={(checked) => field.handleChange(checked)}
                              />
                            </label>
                          )}
                        </form.Field>
                      ) : null
                    }
                  </form.Subscribe>

                  {/* Shown for any non-zero fee, not only a decoupled one. The
                      pool credits `fees[token]` and pays `withdraw` to
                      `feeAddress` in both modes; decoupling only reserves the
                      accrued fees from withdrawable liquidity. Hiding the
                      recipient behind the checkbox left the fee going to
                      whoever deployed the pool with no way to say otherwise. */}
                  <form.Subscribe selector={(state) => Number(state.values.feePolicyDefault) > 0}>
                    {(hasFee) =>
                      hasFee ? (
                        <form.Field
                          name="feeAddress"
                          validators={{
                            onBlur: poolFeeAddressSchema,
                            onSubmit: poolFeeAddressSchema,
                          }}
                        >
                          {(field) => (
                            <Field
                              label={t`Fee recipient`}
                              htmlFor="pool-fee-address"
                              hint={t`Your wallet by default. Enter another address to send the swap fees there.`}
                              error={getFieldError(field.state.meta.errors)}
                            >
                              <RecipientAddressInput
                                id="pool-fee-address"
                                defaultValue={field.state.value}
                                onValueChange={field.handleChange}
                                onRecipientChange={(recipient) => {
                                  if (recipient) field.handleChange(recipient.address);
                                }}
                                onBlur={field.handleBlur}
                                ariaLabel={t`Fee recipient`}
                                ariaInvalid={field.state.meta.errors.length > 0}
                              />
                            </Field>
                          )}
                        </form.Field>
                      ) : null
                    }
                  </form.Subscribe>
                </div>
              </details>
            </div>

            <div className="mt-auto pt-6">
              <Button
                type="button"
                tap
                className="w-full"
                pending={advancing}
                onClick={() => void goToPlace()}
              >
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
              {isStorageConfigured ? (
                <div className="border border-border bg-card p-4">
                  <form.Field name="imageUrl">
                    {(field) => (
                      <ImageUploadField
                        label={t`Logo`}
                        hint={t`Optional`}
                        purpose="pool.image"
                        value={field.state.value || null}
                        onChange={(url) => field.handleChange(url ?? "")}
                        onBusyChange={setLogoBusy}
                        disabled={deployPool.isPending}
                      />
                    )}
                  </form.Field>
                </div>
              ) : null}

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
                          variant="outline"
                          tap
                          pending={tagsQuery.isFetching}
                          onClick={() => void tagsQuery.refetch()}
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
                        navigationHistory={router.history}
                        open={tagsOpen}
                        onOpenChange={setTagsOpen}
                      />
                    ) : null}
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
                      dir="ltr"
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
                      dir="ltr"
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

              <form.Field name="termsMode">
                {(modeField) => (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-sm">
                        <Trans>Terms</Trans>
                      </p>
                      <label className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Trans>Write my own</Trans>
                        <Switch
                          checked={modeField.state.value === "text"}
                          onCheckedChange={(checked) => {
                            modeField.handleChange(checked ? "text" : "url");
                            form.setFieldValue("terms", "");
                          }}
                        />
                      </label>
                    </div>

                    {modeField.state.value === "text" ? (
                      <form.Field
                        name="terms"
                        validators={{
                          onBlur: optionalTermsTextSchema,
                          onSubmit: optionalTermsTextSchema,
                        }}
                      >
                        {(field) => {
                          const error = getFieldError(field.state.meta.errors);
                          return (
                            <div className="mt-1.5">
                              {/* `htmlFor` alone does not name a `contentEditable`,
                                  which is not a labelable element, so the editor is
                                  pointed back at this label by id. */}
                              <label
                                id="pool-terms-text-label"
                                htmlFor="pool-terms-text"
                                className="mb-1.5 block text-muted-foreground text-xs"
                              >
                                <Trans>Shown to anyone joining this pool</Trans>
                              </label>
                              <MarkdownEditor
                                id="pool-terms-text"
                                aria-labelledby="pool-terms-text-label"
                                aria-invalid={field.state.meta.errors.length > 0}
                                maxLength={TERMS_TEXT_MAX}
                                value={field.state.value}
                                onChange={field.handleChange}
                                onBlur={field.handleBlur}
                                placeholder={t`Describe the rules for joining and using this pool...`}
                              />
                              {error ? <FieldError error={error} /> : null}
                            </div>
                          );
                        }}
                      </form.Field>
                    ) : (
                      <form.Field
                        name="terms"
                        validators={{
                          onBlur: optionalTermsUrlSchema,
                          onSubmit: optionalTermsUrlSchema,
                        }}
                      >
                        {(field) => {
                          const error = getFieldError(field.state.meta.errors);
                          return (
                            <div className="mt-1.5">
                              <Input
                                id="pool-terms-url"
                                dir="ltr"
                                type="url"
                                inputMode="url"
                                autoComplete="url"
                                aria-label={t`Terms URL`}
                                value={field.state.value}
                                onChange={(event) => field.handleChange(event.target.value)}
                                onBlur={field.handleBlur}
                                placeholder="https://example.com/terms"
                                aria-invalid={field.state.meta.errors.length > 0}
                              />
                              {error ? <FieldError error={error} /> : null}
                            </div>
                          );
                        }}
                      </form.Field>
                    )}
                  </div>
                )}
              </form.Field>
            </div>

            <div className="mt-auto pt-6">
              <Button
                type="button"
                tap
                className="w-full"
                pending={logoBusy}
                onClick={() => void goToReview()}
              >
                {logoBusy ? <Trans>Uploading…</Trans> : <Trans>Next</Trans>}
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
                <>
                  <dl className="mt-3.5 border border-border bg-card">
                    <PoolDetailsRows values={values} />
                  </dl>
                  {values.terms !== "" && !isHttpUrl(values.terms) ? (
                    <div className="mt-3.5 border border-border bg-card p-4">
                      <p className="text-sm font-semibold leading-snug">
                        <Trans>Terms</Trans>
                      </p>
                      <MarkdownContent className="mt-2">{values.terms}</MarkdownContent>
                    </div>
                  ) : null}
                </>
              )}
            </form.Subscribe>

            <div className="mt-3.5 space-y-3">
              <form.Field name="acceptedTerms" validators={{ onSubmit: poolTermsSchema }}>
                {(field) => (
                  <TermsAcceptanceField
                    id="pool-terms"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    error={getFieldError(field.state.meta.errors)}
                  />
                )}
              </form.Field>
            </div>

            <div className="mt-auto pt-6">
              <form.Subscribe
                selector={(state) =>
                  [state.isSubmitting, state.values.pricing, state.values.acceptedTerms] as const
                }
              >
                {([isSubmitting, pricing, acceptedTerms]) => (
                  <>
                    <Button
                      type="submit"
                      tap
                      className="w-full"
                      disabled={!acceptedTerms || usage.isError || !usage.data?.pools.canCreate}
                      pending={isSubmitting || deployPool.isPending}
                    >
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
  disabled = false,
}: {
  value: PoolPricing;
  title: string;
  description: string;
  isDefault?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] gap-3 border border-border bg-card p-3 has-data-[checked]:border-primary has-data-[checked]:bg-primary/[0.05] has-[[data-disabled]]:cursor-default has-[[data-disabled]]:opacity-50">
      <RadioGroupItem value={value} className="mt-0.5" disabled={disabled} />
      <span>
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-semibold">{title}</strong>
          {isDefault ? (
            <Badge variant="muted" size="sm">
              <Trans>Default</Trans>
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 block text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}
