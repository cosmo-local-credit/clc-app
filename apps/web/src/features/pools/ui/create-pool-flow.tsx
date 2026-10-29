import {
  hasPoolOracleBaseCurrency,
  type PoolPricing,
  poolDeploymentContractCount,
} from "@clc/core/features/pools/logic";
import { isHttpUrl, TERMS_TEXT_MAX } from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { findUnitOfAccountOption } from "@clc/core/lib/currencies";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { PublicContactWarning } from "#/components/public-contact-warning";
import { PublicLocationWarning } from "#/components/public-location-warning";
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
import { ResourceUsage } from "#/components/resource-usage";
import {
  type PoolCreateStep,
  useCreatePoolForm,
} from "#/features/pools/hooks/use-create-pool-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";
import { PoolDetailsRows } from "./pool-details-rows";

export type { PoolCreateStep };

export function CreatePoolFlow({ step }: { step: PoolCreateStep }) {
  const { i18n, t } = useLingui();
  const router = useRouter();
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const {
    form,
    validators,
    activeChainId,
    hasOracle,
    usage,
    deployPool,
    tagsQuery,
    advancing,
    logoBusy,
    setLogoBusy,
    fillSuggestedSymbol,
    suggestSymbolFor,
    normalizeSymbol,
    syncPricingToUnit,
    syncFeeFields,
    goToPlace,
    goToReview,
  } = useCreatePoolForm({
    step,
    revealAdvanced: () => {
      if (advancedRef.current) advancedRef.current.open = true;
    },
  });

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
              <form.Field name="name" asyncDebounceMs={400} validators={validators.name}>
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
                        suggestSymbolFor(field.state.value);
                      }}
                      placeholder={t`Enter pool name`}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.pricing}>
                {(pricing) => (
                  <form.Field name="unitOfAccount" validators={validators.unitOfAccount(pricing)}>
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
                            syncPricingToUnit(unit);
                          }}
                          placeholder={t`Search units of account`}
                          emptyMessage={t`No units of account found`}
                        />
                      </Field>
                    )}
                  </form.Field>
                )}
              </form.Subscribe>

              <form.Field name="description" validators={validators.description}>
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
                  <form.Field name="symbol" validators={validators.symbol}>
                    {(field) => (
                      <Field
                        label={t`Pool symbol`}
                        htmlFor="pool-symbol"
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="pool-symbol"
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(normalizeSymbol(event.target.value))
                          }
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

                  <form.Field name="feePolicyDefault" validators={validators.feePolicyDefault}>
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
                            syncFeeFields(fee);
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
                        <form.Field name="feeAddress" validators={validators.feeAddress}>
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

              <form.Field name="location" validators={validators.location}>
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <LocationPicker
                      label={t`Pool Location`}
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                      markerResource="pool"
                      error={error ? translateValidationError(error, i18n) : undefined}
                    />
                  );
                }}
              </form.Field>
              <PublicLocationWarning />

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

              <PublicContactWarning />

              <form.Field name="email" validators={validators.email}>
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

              <form.Field name="website" validators={validators.website}>
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

              <form.Field name="phone" validators={validators.phone}>
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
                      <form.Field name="terms" validators={validators.termsText}>
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
                      <form.Field name="terms" validators={validators.termsUrl}>
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
              <form.Field name="acceptedTerms" validators={validators.acceptedTerms}>
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
