import { locationSchema } from "@clc/core/features/location/logic";
import { resolveMarkerStyle } from "@clc/core/features/markers/logic";
import {
  voucherDescriptionSchema,
  voucherNameSchema,
  voucherPriceSchema,
  voucherSupplySchema,
  voucherSymbolSchema,
  voucherTermsSchema,
} from "@clc/core/features/vouchers/logic";
import { formatOfferingDisplayPrice } from "@clc/core/features/market/logic";
import {
  isHttpUrl,
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsTextSchema,
  optionalTermsUrlSchema,
  optionalWebsiteSchema,
  TERMS_TEXT_MAX,
} from "@clc/core/lib/contact";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { PublicContactWarning } from "#/components/public-contact-warning";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { ResourceUsage } from "#/components/resource-usage";
import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { MarkdownEditor } from "#/components/ui/markdown-editor";
import { PhoneInputField } from "#/components/ui/phone-input";
import { StepProgress } from "#/components/ui/step-progress";
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";
import { BackChevron } from "#/components/wallet/wallet-kit";
import {
  useCreateVoucherForm,
  VOUCHER_FORM_DEFAULTS,
  type VoucherCreateStep,
} from "#/features/vouchers/hooks/use-create-voucher-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";
import { VoucherDetailsRows } from "./voucher-details-rows";

export type { VoucherCreateStep };

export function CreateVoucherFlow({ step }: { step: VoucherCreateStep }) {
  const { i18n, t } = useLingui();
  const router = useRouter();
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const {
    form,
    blocked,
    deployVoucher,
    tagsQuery,
    profile,
    checkNameAvailable,
    trackSymbol,
    suggestSymbolFor,
    fillSuggestedSymbol,
    iconBusy,
    setIconBusy,
    advancing,
    goToPlace,
    goToReview,
  } = useCreateVoucherForm({
    step,
    revealAdvanced: () => {
      if (advancedRef.current) advancedRef.current.open = true;
    },
  });

  const progressStep = step === "voucher" ? 1 : step === "place" ? 2 : 3;
  const fallbackTo =
    step === "review"
      ? "/vouchers/create/place"
      : step === "place"
        ? "/vouchers/create/voucher"
        : "/wallet/vouchers";

  if (blocked) {
    return (
      <div className="min-h-[100svh] space-y-5 bg-background px-6 pt-6 pb-12">
        <BackChevron label={t`Vouchers`} to="/" />
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Create voucher</Trans>
        </h1>
        <ResourceUsage resource="vouchers" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron
        label={step === "voucher" ? t`Vouchers` : t`Back`}
        to={fallbackTo}
        onClick={step === "place" && tagsOpen ? () => setTagsOpen(false) : undefined}
        className="self-start"
      />

      <StepProgress step={progressStep} total={3} />
      <ResourceUsage resource="vouchers" />

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
              className="mt-3.5 border border-primary/30 bg-card"
              aria-labelledby="voucher-guidance-title"
            >
              <p
                id="voucher-guidance-title"
                className="border-primary/20 border-b bg-primary/[0.08] px-4 py-2.5 font-semibold text-primary text-sm leading-tight"
              >
                <Trans>What's a voucher?</Trans>
              </p>
              <p className="px-4 py-3 text-muted-foreground text-sm leading-snug">
                <Trans>
                  A voucher acts like a gift card for your offers. When someone redeems your
                  voucher, you are committing to provide them with your offers.
                </Trans>
              </p>
            </aside>

            <div className="mt-3.5 space-y-3.5">
              {/*
                Names are unique across the catalog, and this form seeds one from
                the profile -- so the same person walking it twice arrives with a
                name already taken. onChangeAsync says so while they type;
                onSubmitAsync is what makes Next refuse, since goToPlace awaits
                validateField(_, "submit").
              */}
              <form.Field
                name="name"
                asyncDebounceMs={400}
                validators={{
                  onBlur: voucherNameSchema,
                  onSubmit: voucherNameSchema,
                  onChangeAsync: checkNameAvailable,
                  onSubmitAsync: checkNameAvailable,
                }}
              >
                {(field) => (
                  <Field
                    label={t`Voucher Name`}
                    htmlFor="voucher-name"
                    error={getFieldError(field.state.meta.errors)}
                    hint={field.state.meta.isValidating ? t`Checking availability…` : undefined}
                  >
                    <Input
                      id="voucher-name"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={() => {
                        field.handleBlur();
                        suggestSymbolFor(field.state.value);
                      }}
                      placeholder={t`e.g. Community Market`}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field
                name="supply"
                validators={{
                  onBlur: voucherSupplySchema(VOUCHER_FORM_DEFAULTS.decimals),
                  onSubmit: voucherSupplySchema(VOUCHER_FORM_DEFAULTS.decimals),
                }}
              >
                {(field) => (
                  <Field
                    label={t`Create vouchers`}
                    htmlFor="voucher-supply"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-supply"
                      dir="ltr"
                      inputMode="decimal"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Subscribe
                selector={(state) =>
                  [
                    state.values.supply,
                    state.values.price,
                    state.values.unitOfAccount,
                    state.values.name,
                  ] as const
                }
              >
                {([supply, price, unit, name]) => {
                  const value = formatOfferingDisplayPrice(supply, price, unit, name);
                  return value ? (
                    <p className="-mt-2 font-mono text-muted-foreground text-xs tabular-nums">
                      <Trans>
                        Value: {value.value} {value.unit} of offerings
                      </Trans>
                    </p>
                  ) : null;
                }}
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
                  id="voucher-advanced"
                  className="mt-4 space-y-3.5 border border-border bg-card p-4"
                >
                  <form.Field
                    name="symbol"
                    validators={{ onBlur: voucherSymbolSchema, onSubmit: voucherSymbolSchema }}
                  >
                    {(field) => (
                      <Field
                        label={t`Voucher Symbol`}
                        htmlFor="voucher-symbol"
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="voucher-symbol"
                          value={field.state.value}
                          onChange={(event) => {
                            const symbol = event.target.value.toUpperCase();
                            field.handleChange(symbol);
                            trackSymbol(symbol);
                          }}
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
                        className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2.5"
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
                                  dir="ltr"
                                  inputMode="decimal"
                                  className="pe-16"
                                  value={field.state.value}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  onBlur={field.handleBlur}
                                  aria-invalid={field.state.meta.errors.length > 0}
                                />
                                <span
                                  data-slot="voucher-price-unit"
                                  className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-muted-foreground text-sm"
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
                              <UnitOfAccountCombobox
                                id="voucher-currency"
                                value={field.state.value}
                                onValueChange={field.handleChange}
                                placeholder={t`Search units of account`}
                                emptyMessage={t`No units of account found`}
                              />
                            </Field>
                          )}
                        </form.Field>
                      </div>
                    )}
                  </form.Subscribe>

                  <form.Subscribe
                    selector={(state) =>
                      [state.values.name, state.values.price, state.values.unitOfAccount] as const
                    }
                  >
                    {([name, price, unit]) => {
                      const voucherName = name.trim() || t`voucher`;
                      return (
                        <p className="-mt-2 font-mono text-muted-foreground text-xs tabular-nums">
                          {`1 ${voucherName} = ${price || "—"} ${unit}`}
                        </p>
                      );
                    }}
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
                  <form.Field name="iconUrl">
                    {(field) => (
                      <ImageUploadField
                        label={t`Logo`}
                        hint={t`Optional`}
                        purpose="voucher.icon"
                        value={field.state.value || null}
                        onChange={(url) => field.handleChange(url ?? "")}
                        onBusyChange={setIconBusy}
                        disabled={deployVoucher.isPending}
                      />
                    )}
                  </form.Field>
                </div>
              ) : null}

              <form.Field name="location" validators={{ onSubmit: locationSchema }}>
                {(field) => {
                  const error = getFieldError(field.state.meta.errors);
                  return (
                    <form.Subscribe
                      selector={(state) =>
                        [state.values.markerIcon, state.values.markerColor] as const
                      }
                    >
                      {([markerIcon, markerColor]) => (
                        <LocationPicker
                          value={field.state.value}
                          onChange={(value) => field.handleChange(value)}
                          error={error ? translateValidationError(error, i18n) : undefined}
                          markerStyle={resolveMarkerStyle({
                            kind: "voucher",
                            markerIcon,
                            markerColor,
                          })}
                        />
                      )}
                    </form.Subscribe>
                  );
                }}
              </form.Field>
              <PublicLocationWarning />

              <form.Subscribe selector={(state) => state.values.markerIcon}>
                {(icon) => (
                  <div className="border border-border bg-card p-4">
                    <MarkerStylePicker
                      kind="voucher"
                      value={icon}
                      onChange={(next) => form.setFieldValue("markerIcon", next)}
                      disabled={deployVoucher.isPending}
                    />
                  </div>
                )}
              </form.Subscribe>

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
                        searchLabel={t`Search voucher tags`}
                        selectedLabel={t`Selected voucher tags`}
                        listLabel={t`Voucher tags`}
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
                    htmlFor="voucher-website"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-website"
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
                    htmlFor="voucher-phone"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <PhoneInputField
                      id="voucher-phone"
                      defaultCountry={profile?.country}
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
                            // A link and a body of text are different things;
                            // one does not become the other by flipping the switch.
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
                                id="voucher-terms-text-label"
                                htmlFor="voucher-terms-text"
                                className="mb-1.5 block text-muted-foreground text-xs"
                              >
                                <Trans>Shown to anyone holding this voucher</Trans>
                              </label>
                              <MarkdownEditor
                                id="voucher-terms-text"
                                aria-labelledby="voucher-terms-text-label"
                                aria-invalid={field.state.meta.errors.length > 0}
                                maxLength={TERMS_TEXT_MAX}
                                value={field.state.value}
                                onChange={field.handleChange}
                                onBlur={field.handleBlur}
                                placeholder={t`Redeemable at our stall on market days...`}
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
                                id="voucher-terms-url"
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
                pending={iconBusy}
                onClick={() => void goToReview()}
              >
                {iconBusy ? <Trans>Uploading…</Trans> : <Trans>Next</Trans>}
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
                    <VoucherDetailsRows values={values} />
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
              <form.Field name="acceptedTerms" validators={{ onSubmit: voucherTermsSchema }}>
                {(field) => (
                  <TermsAcceptanceField
                    id="voucher-terms"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    error={getFieldError(field.state.meta.errors)}
                  />
                )}
              </form.Field>
            </div>

            <div className="mt-auto pt-6">
              <form.Subscribe
                selector={(state) => [state.isSubmitting, state.values.acceptedTerms] as const}
              >
                {([isSubmitting, acceptedTerms]) => (
                  <Button
                    type="submit"
                    tap
                    className="w-full"
                    disabled={!acceptedTerms || blocked}
                    pending={isSubmitting || deployVoucher.isPending}
                  >
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
