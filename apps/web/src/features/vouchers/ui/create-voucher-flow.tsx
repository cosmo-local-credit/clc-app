import { type LocationInput, locationSchema } from "@clc/core/features/location/logic";
import type { MarkerColor, MarkerIcon } from "@clc/core/features/markers/logic";
import {
  toVoucherDeployPayload,
  type VoucherUnit,
  voucherCreateSchema,
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
import { profilePrefill } from "@clc/core/features/signup/prefill";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RiLoader4Line } from "react-icons/ri";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { MarkdownContent } from "#/components/ui/markdown-content";
import { PhoneInputField } from "#/components/ui/phone-input";
import { StepProgress } from "#/components/ui/step-progress";
import { Switch } from "#/components/ui/switch";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { Toggle } from "#/components/ui/toggle";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useDeployVoucher } from "#/features/vouchers/hooks/use-voucher-deployment";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { useTokenTags } from "#/hooks/use-deployment";
import { useNameAvailabilityValidator } from "#/hooks/use-name-availability";
import { useSuggestedSymbol } from "#/hooks/use-suggested-symbol";
import { isStorageConfigured } from "#/lib/api/storage";
import {
  beginVoucherCreateHistory,
  exitVoucherCreateHistory,
} from "#/lib/navigation/voucher-create-history";
import { translateValidationError } from "#/lib/validation-i18n";
import { VoucherDetailsRows } from "./voucher-details-rows";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";

export type VoucherCreateStep = "voucher" | "place" | "review";

type VoucherFormValues = {
  name: string;
  symbol: string;
  price: string;
  unitOfAccount: VoucherUnit;
  description: string;
  voucherType: "standard";
  expiryDate: string;
  decimals: string;
  supply: string;
  location: LocationInput | undefined;
  tags: string[];
  email: string;
  website: string;
  phone: string;
  terms: string;
  /** Form-only: whether `terms` is a link or the terms themselves. */
  termsMode: "url" | "text";
  iconUrl: string;
  markerIcon: MarkerIcon | null;
  markerColor: MarkerColor | null;
  acceptedTerms: boolean;
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
  supply: "1000",
  location: undefined,
  tags: [],
  email: "",
  website: "",
  phone: "",
  terms: "",
  termsMode: "url",
  iconUrl: "",
  markerIcon: null,
  markerColor: null,
  acceptedTerms: false,
};

/** The text fields a saved profile can seed, all of which default to "". */
type SeedableTextField = "name" | "email" | "phone" | "website" | "description" | "iconUrl";

const DETAIL_FIELDS = ["name", "symbol", "price", "supply", "description"] as const;
/** Detail fields folded under "Advanced"; an error there has to unfold it to be seen. */
const ADVANCED_FIELDS = ["symbol", "price", "unitOfAccount"] as const;
const PLACE_FIELDS = ["location", "email", "website", "phone", "terms", "iconUrl"] as const;

export function CreateVoucherFlow({ step }: { step: VoucherCreateStep }) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { address } = useConnection();
  const deployVoucher = useDeployVoucher();
  const tagsQuery = useTokenTags();
  const profileQuery = useAuthProfile();
  const draft = useVoucherCreateDraft((state) => state.draft);
  const setDraft = useVoucherCreateDraft((state) => state.setDraft);
  const hasPrefilledProfile = useRef(false);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const suggestedSymbol = useSuggestedSymbol({
    kind: "voucher",
    initialSymbol: draft?.symbol ?? "",
  });
  const checkNameAvailable = useNameAvailabilityValidator("voucher");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const [termsPreview, setTermsPreview] = useState(false);

  const defaultValues: VoucherFormValues = draft
    ? {
        ...draft,
        voucherType: "standard",
        expiryDate: "",
        decimals: "6",
        iconUrl: draft.iconUrl ?? "",
        termsMode: draft.terms && !isHttpUrl(draft.terms) ? "text" : "url",
      }
    : DEFAULT_VALUES;
  const form = useForm({
    defaultValues,
    validators: {
      // A function rather than the schema itself: the form carries `termsMode`,
      // which the schema neither knows nor needs, so the two types differ.
      onSubmit: ({ value }) => {
        const result = voucherCreateSchema.safeParse(value);
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
      if (!address) {
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
      const parsed = voucherCreateSchema.parse({
        ...value,
        symbol: check.symbol,
        voucherType: "standard",
        expiryDate: "",
        decimals: "6",
      });
      setDraft(parsed);
      try {
        const result = await deployVoucher.mutateAsync(
          toVoucherDeployPayload(parsed, getAddress(address)),
        );
        // The opening supply rides along in the URL so the receipt can mint it
        // as soon as the contract confirms, even after a reload loses the draft.
        exitVoucherCreateHistory({
          history: router.history,
          destination: `/vouchers/create/receipt?trackingId=${encodeURIComponent(result.trackingId)}&mintAmount=${encodeURIComponent(parsed.supply.trim())}`,
        });
      } catch (error) {
        // The availability check is advisory, so a name free when the user left
        // step 1 can be taken by the time they publish. Say which field is
        // wrong and put them back in front of it rather than leaving a raw
        // error code under a review screen they cannot act on.
        if (error instanceof BackendApiError && error.kind === "conflict") {
          toast.error(t`That voucher name was taken while you were filling this in.`);
          void navigate({ to: "/vouchers/create/$step", params: { step: "voucher" } });
          void form.validateField("name", "submit");
          return;
        }
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

  // Everything the issuer already told us about themselves during onboarding is
  // the same thing this form asks for again, so it starts filled in. Only an
  // untouched field still holding its default is seeded — a retry draft, or a
  // value the issuer has typed over, always wins.
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
    seedText("name", prefill.name ? `${prefill.name} Voucher` : "");
    // The bio is free text with no minimum, so it only becomes a description
    // when it would pass as one.
    if (voucherDescriptionSchema.safeParse(prefill.description).success) {
      seedText("description", prefill.description);
    }
    // Only where the upload fields are rendered: seeding a hidden field would
    // attach a photo the issuer was never shown.
    if (isStorageConfigured) seedText("iconUrl", prefill.imageUrl);

    if (
      prefill.unitOfAccount &&
      !form.getFieldMeta("unitOfAccount")?.isTouched &&
      form.getFieldValue("unitOfAccount") === DEFAULT_VALUES.unitOfAccount
    ) {
      form.setFieldValue("unitOfAccount", prefill.unitOfAccount, { dontUpdateMeta: true });
    }

    if (
      prefill.location &&
      !form.getFieldMeta("location")?.isTouched &&
      form.getFieldValue("location") === undefined
    ) {
      form.setFieldValue("location", prefill.location, { dontUpdateMeta: true });
    }
  }, [draft, form, profileQuery.data]);

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
    // Blur may not have fired, or its lookup may still be in flight.
    await fillSuggestedSymbol();
    if (!(await fieldsAreValid(DETAIL_FIELDS))) {
      if (ADVANCED_FIELDS.some((field) => (form.getFieldMeta(field)?.errors.length ?? 0) > 0)) {
        if (advancedRef.current) advancedRef.current.open = true;
      }
      return;
    }
    void navigate({ to: "/vouchers/create/$step", params: { step: "place" } });
  }

  async function goToReview() {
    if (iconBusy) return;
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
        onClick={step === "place" && tagsOpen ? () => setTagsOpen(false) : undefined}
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
                        void suggestedSymbol.suggest(field.state.value).then((symbol) => {
                          if (symbol !== undefined) form.setFieldValue("symbol", symbol);
                        });
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
                  onBlur: voucherSupplySchema(DEFAULT_VALUES.decimals),
                  onSubmit: voucherSupplySchema(DEFAULT_VALUES.decimals),
                }}
              >
                {(field) => (
                  <Field
                    label={t`Create vouchers`}
                    htmlFor="voucher-supply"
                    hint={t`How many vouchers to create once this voucher is published`}
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
                        hint={t`Suggested from the name. You can change it.`}
                        error={getFieldError(field.state.meta.errors)}
                      >
                        <Input
                          id="voucher-symbol"
                          value={field.state.value}
                          onChange={(event) => {
                            const symbol = event.target.value.toUpperCase();
                            field.handleChange(symbol);
                            suggestedSymbol.track(symbol);
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
                                placeholder={t`Search currencies`}
                                emptyMessage={t`No currencies found.`}
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
                    <LocationPicker
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                      error={error ? translateValidationError(error, i18n) : undefined}
                    />
                  );
                }}
              </form.Field>

              <form.Subscribe
                selector={(state) => [state.values.markerIcon, state.values.markerColor] as const}
              >
                {([icon, color]) => (
                  <div className="border border-border bg-card p-4">
                    <MarkerStylePicker
                      kind="voucher"
                      value={{ icon, color }}
                      onChange={(next) => {
                        form.setFieldValue("markerIcon", next.icon);
                        form.setFieldValue("markerColor", next.color);
                      }}
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
                            setTermsPreview(false);
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
                        {(field) => (
                          <div className="mt-1.5">
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                              <label
                                htmlFor="voucher-terms-text"
                                className="text-muted-foreground text-xs"
                              >
                                <Trans>Shown to anyone holding this voucher</Trans>
                              </label>
                              <Toggle
                                variant="outline"
                                pressed={termsPreview}
                                onPressedChange={setTermsPreview}
                                aria-label={t`Preview`}
                              >
                                <Trans>Preview</Trans>
                              </Toggle>
                            </div>
                            {termsPreview ? (
                              <div className="min-h-24 border border-border bg-card p-3">
                                {field.state.value.trim() === "" ? (
                                  <p className="text-muted-foreground text-sm">
                                    <Trans>Nothing to preview yet.</Trans>
                                  </p>
                                ) : (
                                  <MarkdownContent>{field.state.value}</MarkdownContent>
                                )}
                              </div>
                            ) : (
                              <Textarea
                                id="voucher-terms-text"
                                rows={8}
                                maxLength={TERMS_TEXT_MAX}
                                className="font-mono text-[0.8125rem]"
                                value={field.state.value}
                                onChange={(event) => field.handleChange(event.target.value)}
                                onBlur={field.handleBlur}
                                placeholder={t`Redeemable at our stall on market days...`}
                                aria-invalid={field.state.meta.errors.length > 0}
                              />
                            )}
                            {getFieldError(field.state.meta.errors) ? (
                              <FieldError error={getFieldError(field.state.meta.errors) ?? ""} />
                            ) : (
                              <p className="mt-1 text-muted-foreground text-xs">
                                <Trans>
                                  Markdown: **bold**, # headings, - lists, [links](https://…)
                                </Trans>
                              </p>
                            )}
                          </div>
                        )}
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
                              {error ? (
                                <FieldError error={error} />
                              ) : (
                                <p className="mt-1 text-muted-foreground text-xs">
                                  <Trans>Link to the terms that apply to this voucher</Trans>
                                </p>
                              )}
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
                className="h-11 w-full"
                disabled={iconBusy}
                onClick={() => void goToReview()}
              >
                {iconBusy ? (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
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
                      <p className="font-heading text-sm font-semibold leading-snug">
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
                    className="h-11 w-full"
                    disabled={!acceptedTerms || isSubmitting || deployVoucher.isPending}
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
