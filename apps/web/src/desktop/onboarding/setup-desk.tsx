import { findUnitOfAccountOption, formatUnitOfAccountOption } from "@clc/core/lib/currencies";
import type { LocationInput } from "@clc/core/features/location/logic";
import { useStore } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Suspense, useState } from "react";
import { FaApple, FaGoogle, FaUser } from "react-icons/fa";
import { FiLock } from "react-icons/fi";
import {
  RiArrowDownSLine,
  RiDownloadLine,
  RiPrinterLine,
  RiShareLine,
  RiSearchLine,
  RiUploadLine,
} from "react-icons/ri";
import { TbCurrentLocation } from "react-icons/tb";

import { ProfilePrivacyNotice } from "#/components/profile-privacy-notice";
import { UsernameInput } from "#/components/profile/username-input";
import { TermsAcceptanceField } from "#/components/terms-acceptance-field";
import { AgreementField } from "#/components/ui/agreement-field";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { CLCLogo } from "#/components/ui/clc-logo";
import { Input } from "#/components/ui/input";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { DeskPhoneField } from "#/desktop/ui/phone-field";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "#/components/ui/popover";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { SectionHeading } from "#/components/ui/section-heading";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { useAvatarPicker } from "#/components/ui/use-avatar-picker";
import { useLocationPicker } from "#/components/ui/use-location-picker";
import { DeskRow, DeskRowList, DeskEyebrow, DeskTitle } from "#/desktop/ui/page";
import { DeskStep, DeskStepper } from "#/desktop/ui/stepper";
import { type SetupStep, useOnboardingFlow } from "#/features/onboarding/hooks/use-onboarding-flow";
import { useOnboardingProfile } from "#/features/onboarding/hooks/use-onboarding-profile";
import {
  type UseOnboardingWalletOptions,
  useOnboardingWallet,
} from "#/features/onboarding/hooks/use-onboarding-wallet";
import { pickPasskeyProvider } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { isStorageConfigured } from "#/lib/api/storage";
import { onboardingSearch, type OnboardingStep } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";
import { AvatarCropDialog } from "./avatar-crop-dialog";
import { PaperWalletCardTile, PaperWalletCustomizeInspector } from "./paper-wallet-desk";

/**
 * Account setup on desktop: the step list beside a 760px form column. The
 * flow, the form and the wallet work are the phone's own hooks; only the
 * layout is desktop.
 */
export function SetupDesk({ step, redirectTo }: { step: SetupStep; redirectTo?: string }) {
  const flow = useOnboardingFlow({ step, redirectTo });
  const frame = { step, redirectTo, passkeyAvailable: flow.passkeyAvailable };

  if (flow.wallet) {
    return (
      <WalletSteps
        {...flow.wallet}
        frame={frame}
        onPage={flow.go}
        linkPasskey={flow.passkeyAvailable}
      />
    );
  }
  return <ProfileSteps {...flow.profile} onPage={flow.go} frame={frame} redirectTo={redirectTo} />;
}

type FrameProps = { step: SetupStep; redirectTo?: string; passkeyAvailable: boolean };

function SetupFrame({
  frame,
  allDone = false,
  children,
}: {
  frame: FrameProps;
  /** Setting up: nothing more is asked, so every step reads as done. */
  allDone?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="h-dvh overflow-y-auto bg-background">
      <div className="grid grid-cols-[260px_minmax(0,760px)] content-start gap-10 px-12 py-10">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <CLCLogo className="size-6 shrink-0" sharp />
            <span className="font-heading text-lg font-bold">CLC</span>
          </div>
          <SetupStepper {...frame} allDone={allDone} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

function SetupStepper({
  step,
  redirectTo,
  passkeyAvailable,
  allDone,
}: FrameProps & { allDone: boolean }) {
  const { t } = useLingui();
  const providerLabel = pickPasskeyProvider() === "apple" ? "Apple ID" : "Google";
  const steps: SetupStep[] = passkeyAvailable
    ? ["profile", "contact", "location", "card", "save", "link"]
    : ["profile", "contact", "location", "card", "save"];
  const current = allDone ? steps.length : steps.indexOf(step);
  const labels: Record<SetupStep, ReactNode> = {
    profile: <Trans>Create your account</Trans>,
    contact: <Trans>Contact</Trans>,
    location: <Trans>Location</Trans>,
    card: <Trans>Your paper wallet</Trans>,
    save: <Trans>Save your card</Trans>,
    link: t`Link ${providerLabel}?`,
  };

  return (
    <DeskStepper label={t`Create account`}>
      {steps.map((id, index) => {
        const state = index < current ? "complete" : index === current ? "current" : "upcoming";
        return (
          <DeskStep
            key={id}
            index={index + 1}
            state={state}
            label={labels[id]}
            wrap={
              state === "upcoming" || allDone
                ? undefined
                : (body) => (
                    <Link
                      to="/onboarding"
                      search={onboardingSearch(id, redirectTo)}
                      className="outline-none focus-visible:outline-2 focus-visible:outline-foreground"
                    >
                      {body}
                    </Link>
                  )
            }
          />
        );
      })}
    </DeskStepper>
  );
}

/** Back walks real history, as on the phone; a deep link falls back to the step before. */
function BackButton({ to, redirectTo }: { to: OnboardingStep; redirectTo?: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        if (canGoBack) router.history.back();
        else void navigate({ to: "/onboarding", search: onboardingSearch(to, redirectTo) });
      }}
    >
      <Trans>Back</Trans>
    </Button>
  );
}

/** The form foot: a note at the start, the actions at the end, over a rule. */
function FormFoot({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-border border-t pt-4">
      <div className="min-w-0 flex-1 text-muted-foreground text-xs">{note}</div>
      {children}
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
  optional = false,
}: {
  htmlFor: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-1.5 font-medium text-sm">
      {children}
      {optional ? (
        <span className="font-normal text-muted-foreground text-xs">
          <Trans>Optional</Trans>
        </span>
      ) : null}
    </label>
  );
}

function FieldMessage({ error }: { error: string | null }) {
  return error ? <p className="mt-1 text-destructive text-xs">{error}</p> : null;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type ProfileStepsProps = Omit<Parameters<typeof useOnboardingProfile>[0], "onPage"> & {
  onPage: (step: OnboardingStep) => void;
  frame: FrameProps;
  redirectTo?: string;
};

function ProfileSteps({ frame, redirectTo, ...options }: ProfileStepsProps) {
  const { t } = useLingui();
  const { page } = options;
  const profile = useOnboardingProfile(options);
  const { form, shownError } = profile;
  const picker = useAvatarPicker({ value: profile.avatarFile, onChange: profile.setAvatarFile });
  const name = useStore(form.store, (state) => state.values.name);

  const title =
    page === "profile" ? (
      <Trans>Create your account</Trans>
    ) : page === "contact" ? (
      <Trans>Contact</Trans>
    ) : (
      <Trans>Location</Trans>
    );

  const avatar = (size: "lg" | "sm") => (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-heading font-bold",
        size === "lg" ? "size-18 text-lg" : "size-8 text-2xs",
      )}
    >
      {picker.shown ? (
        <ProgressiveImage
          src={picker.shown}
          alt={size === "lg" ? t`Your profile photo` : ""}
          className="size-full object-cover"
        />
      ) : initialsOf(name) ? (
        initialsOf(name)
      ) : (
        <FaUser aria-hidden className="size-1/3 text-muted-foreground" />
      )}
    </span>
  );

  return (
    <SetupFrame frame={frame}>
      <DeskTitle>{title}</DeskTitle>
      <form
        id="onboarding-profile"
        ref={profile.formRef}
        aria-label={t`Create account`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void profile.handleContinue();
        }}
        className="flex flex-col gap-5"
      >
        {page === "profile" ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex min-w-0 flex-col gap-4.5">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-medium text-sm">
                  <Trans>Photo</Trans>
                  <Badge variant="outline" size="sm" caps>
                    <Trans>Required</Trans>
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  {avatar("lg")}
                  <PhotoInput
                    onSelect={picker.select}
                    disabled={!isStorageConfigured}
                    invalid={!!profile.photoError}
                  />
                  {profile.avatarFile ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!isStorageConfigured}
                      onClick={picker.remove}
                    >
                      {t`Remove`}
                    </Button>
                  ) : null}
                </div>
                {profile.photoError ? (
                  <p className="mt-1 text-destructive text-xs" role="alert">
                    {profile.photoError}
                  </p>
                ) : null}
                <FieldMessage error={picker.error} />
                {!isStorageConfigured ? (
                  <p className="mt-1 text-destructive text-xs" role="alert">
                    {t`Photo uploads are unavailable right now.`}
                  </p>
                ) : null}
              </div>
              <form.Field name="name">
                {(field) => {
                  const err = shownError("name", field.state.meta.isTouched);
                  return (
                    <div>
                      <FieldLabel htmlFor="onb-name">
                        <Trans>Name</Trans>
                      </FieldLabel>
                      <Input
                        id="onb-name"
                        type="text"
                        autoComplete="name"
                        placeholder={t`Your name`}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!!err}
                      />
                      <FieldMessage error={err} />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="username">
                {(field) => (
                  <UsernameInput
                    id="onb-username"
                    value={field.state.value ?? ""}
                    hint={() => form.getFieldValue("name")}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    error={shownError("username", field.state.meta.isTouched)}
                  />
                )}
              </form.Field>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <DeskEyebrow>
                <Trans>Preview</Trans>
              </DeskEyebrow>
              <DeskRowList>
                <DeskRow
                  lead={avatar("sm")}
                  title={name.trim() || t`Your name`}
                  subtitle={<Trans>New member</Trans>}
                />
              </DeskRowList>
            </div>
          </div>
        ) : null}

        {page === "contact" ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <form.Field name="email">
                {(field) => {
                  const err = shownError("email", field.state.meta.isTouched);
                  return (
                    <div className="min-w-0">
                      <FieldLabel htmlFor="onb-email">
                        <Trans>Email</Trans>
                      </FieldLabel>
                      <Input
                        id="onb-email"
                        dir="ltr"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!!err}
                      />
                      <FieldMessage error={err} />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="phone">
                {(field) => {
                  const err = shownError("phone", field.state.meta.isTouched);
                  return (
                    <div className="min-w-0">
                      <FieldLabel htmlFor="onb-phone">
                        <Trans>Phone</Trans>
                      </FieldLabel>
                      <DeskPhoneField
                        id="onb-phone"
                        defaultCountry={profile.suggestedCountry}
                        value={field.state.value}
                        onChange={(val) => field.handleChange(val)}
                        invalid={!!err}
                      />
                      <FieldMessage error={err} />
                    </div>
                  );
                }}
              </form.Field>
              <form.Field name="website">
                {(field) => {
                  const err = shownError("website", field.state.meta.isTouched);
                  return (
                    <div className="min-w-0">
                      <FieldLabel htmlFor="onb-website" optional>
                        <Trans>Website</Trans>
                      </FieldLabel>
                      <Input
                        id="onb-website"
                        dir="ltr"
                        type="url"
                        autoComplete="url"
                        inputMode="url"
                        placeholder="https://example.com"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!!err}
                      />
                      <FieldMessage error={err} />
                    </div>
                  );
                }}
              </form.Field>
            </div>
            <form.Field name="bio">
              {(field) => {
                const err = shownError("bio", field.state.meta.isTouched);
                return (
                  <div>
                    <FieldLabel htmlFor="onb-bio" optional>
                      <Trans>Bio</Trans>
                    </FieldLabel>
                    <Textarea
                      id="onb-bio"
                      rows={3}
                      maxLength={500}
                      placeholder={t`Tell people a little about yourself`}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={!!err}
                    />
                    <FieldMessage error={err} />
                  </div>
                );
              }}
            </form.Field>
            <ProfilePrivacyNotice />
          </>
        ) : null}

        {page === "location" ? (
          <>
            <form.Field name="location">
              {(field) => (
                <LocationField
                  value={field.state.value}
                  cameraHint={profile.approximateCamera}
                  onChange={(next) => {
                    field.handleChange(next);
                    if (next) profile.suggestForCountry(next.country);
                  }}
                  error={shownError("location", field.state.meta.isTouched) ?? undefined}
                />
              )}
            </form.Field>
            <form.Field name="preferredCurrency">
              {(field) => (
                <UnitOfAccountField
                  value={field.state.value}
                  error={shownError("preferredCurrency", field.state.meta.isTouched)}
                  onChange={(currency) => {
                    profile.markCurrencyChosen();
                    field.handleChange(currency);
                  }}
                />
              )}
            </form.Field>
          </>
        ) : null}

        <FormFoot
          note={
            page === "profile" ? (
              <>
                <Trans>Already have an account?</Trans>{" "}
                <Link
                  to="/onboarding"
                  search={onboardingSearch("signin", redirectTo)}
                  replace
                  className="font-semibold text-primary hover:underline"
                >
                  <Trans>Go back to sign in</Trans>
                </Link>
              </>
            ) : null
          }
        >
          {page === "profile" ? null : <BackButton to={profile.previous} redirectTo={redirectTo} />}
          <Button type="submit" disabled={!isStorageConfigured}>
            <Trans>Continue</Trans>
          </Button>
        </FormFoot>
      </form>
      <AvatarCropDialog
        file={picker.pending}
        onCancel={picker.cancelCrop}
        onCropped={picker.acceptCrop}
      />
    </SetupFrame>
  );
}

/** Upload, straight to the file dialog: a laptop has no camera-or-library choice to make. */
function PhotoInput({
  onSelect,
  disabled,
  invalid,
}: {
  onSelect: (file: File | undefined) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const { t } = useLingui();
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={setInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t`Choose a profile photo`}
        aria-required
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          onSelect(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onClick={() => input?.click()}
      >
        <RiUploadLine aria-hidden="true" />
        <Trans>Upload</Trans>
      </Button>
    </>
  );
}

/** The place search beside "Use my location", over a 360px map to drop or drag the pin. */
function LocationField({
  value,
  onChange,
  error,
  cameraHint,
}: {
  value: LocationInput | undefined;
  onChange: (value: LocationInput | undefined) => void;
  error?: string;
  cameraHint?: { lat: number; lng: number; zoom: number } | null;
}) {
  const { t } = useLingui();
  const picker = useLocationPicker({ value, onChange, error });
  const mapFallback = (
    <output className="block h-90 w-full border border-border bg-card">
      <span className="sr-only">
        <Trans>Loading location map</Trans>
      </span>
    </output>
  );

  return (
    <div className="grid gap-3">
      <label htmlFor="onb-location-search" className="sr-only">
        <Trans>Location</Trans>
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="onb-location-search"
            type="text"
            role="searchbox"
            autoComplete="off"
            placeholder={t`Search for a town or place`}
            value={picker.query}
            onChange={(event) => picker.search(event.target.value)}
            className="ps-9"
            aria-invalid={!!picker.shownError}
            aria-required
          />
          {picker.suggestions.length > 0 ? (
            <div
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-1 border border-border bg-popover py-1"
            >
              {picker.suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.address}-${suggestion.lat}-${suggestion.lng}`}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="block w-full truncate px-3 py-2 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => picker.chooseSuggestion(suggestion)}
                >
                  {suggestion.address}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={picker.geolocation.request}
          disabled={picker.geoUnavailable}
          pending={picker.geoRequesting}
        >
          {picker.geoRequesting ? null : <TbCurrentLocation aria-hidden="true" />}
          {picker.geoUnavailable ? (
            <Trans>Location unavailable</Trans>
          ) : (
            <Trans>Use my location</Trans>
          )}
        </Button>
      </div>
      {picker.canRenderMap ? (
        <Suspense fallback={mapFallback}>
          <LocationMap
            lat={picker.pin?.lat ?? null}
            lng={picker.pin?.lng ?? null}
            cameraHint={cameraHint}
            interactive
            onLocationChange={picker.placePin}
            className="h-90"
          />
        </Suspense>
      ) : (
        mapFallback
      )}
      {picker.searching ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Searching places…</Trans>
        </p>
      ) : null}
      {picker.reversePending ? (
        <output className="text-muted-foreground text-xs">
          <Trans>Identifying location…</Trans>
        </output>
      ) : null}
      {picker.shownError ? <p className="text-destructive text-xs">{picker.shownError}</p> : null}
      {picker.geolocation.state.status === "error" ? (
        <p className="text-destructive text-xs">{picker.geolocation.state.message}</p>
      ) : null}
    </div>
  );
}

/** The unit of account as a searchable list in a popover under its field. */
function UnitOfAccountField({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | null;
  onChange: (currency: string) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const option = findUnitOfAccountOption(value);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="min-w-0">
        <FieldLabel htmlFor="onb-preferred-currency-trigger">
          <Trans>Preferred unit of account</Trans>
        </FieldLabel>
        <PopoverRoot open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            id="onb-preferred-currency-trigger"
            aria-invalid={!!error || undefined}
            className="flex h-9 w-full min-w-0 items-center gap-2 border border-input bg-card px-3 text-start text-sm outline-none focus-visible:border-foreground aria-invalid:border-destructive"
          >
            <span className="min-w-0 flex-1 truncate">
              {option ? formatUnitOfAccountOption(option) : value}
            </span>
            <RiArrowDownSLine className="size-4 shrink-0" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-90 p-3">
            <UnitOfAccountCombobox
              id="onb-preferred-currency"
              value={value}
              onValueChange={(currency) => {
                onChange(currency);
                setOpen(false);
              }}
              placeholder={t`Search units of account`}
              emptyMessage={t`No units of account found`}
              ariaLabel={t`Preferred unit of account`}
              ariaInvalid={!!error}
            />
          </PopoverContent>
        </PopoverRoot>
        <FieldMessage error={error} />
      </div>
    </div>
  );
}

type WalletStepsProps = UseOnboardingWalletOptions & {
  onPage: (step: OnboardingStep) => void;
  frame: FrameProps;
  linkPasskey: boolean;
};

function WalletSteps({ frame, onPage, linkPasskey, ...options }: WalletStepsProps) {
  const { t } = useLingui();
  const { page } = options;
  const { redirectTo } = frame;
  const wallet = useOnboardingWallet(options);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { protection, setup, providerLabel } = wallet;
  const ProviderIcon = wallet.provider === "apple" ? FaApple : FaGoogle;

  if (wallet.showPendingView) {
    return (
      <SetupFrame frame={frame} allDone>
        <SettingUp
          path={wallet.pendingPath}
          phase={wallet.pendingPhase}
          status={wallet.statusText}
        />
      </SetupFrame>
    );
  }

  const finishing =
    wallet.errorMessage || wallet.statusText ? (
      <div className="grid gap-1">
        {wallet.errorMessage ? (
          <p role="alert" className="text-destructive text-xs">
            {wallet.errorMessage}
          </p>
        ) : null}
        {wallet.statusText ? (
          <p className="text-muted-foreground text-xs">{wallet.statusText}</p>
        ) : null}
      </div>
    ) : null;

  if (page === "card") {
    return (
      <SetupFrame frame={frame}>
        <DeskTitle>
          <Trans>Your paper wallet</Trans>
        </DeskTitle>
        <div className="grid grid-cols-2 items-start gap-4">
          <PaperWalletCardTile setup={setup} />
          <form
            className="flex min-w-0 flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (protection.needsPassword) void protection.protect();
            }}
          >
            <div className="border border-border border-s-3 border-s-warning bg-card px-4 py-3.5 text-sm">
              <Trans>
                Save this card securely. If you use a password, keep it separately. Anyone with an
                unprotected QR code can access the wallet.
              </Trans>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5">
              <Checkbox checked={protection.enabled} onCheckedChange={protection.setEnabled} />
              <SectionHeading as="h2">
                <Trans>Protect paper wallet with a password</Trans>
              </SectionHeading>
            </label>
            {protection.enabled ? (
              <>
                <div>
                  <FieldLabel htmlFor="pw-passphrase">
                    <Trans>Password</Trans>
                  </FieldLabel>
                  <Input
                    id="pw-passphrase"
                    type="password"
                    autoComplete="new-password"
                    className="font-mono"
                    value={protection.passphrase}
                    onChange={(event) => protection.setPassphrase(event.target.value)}
                    aria-invalid={!!protection.error}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pw-passphrase-confirm">
                    <Trans>Confirm password</Trans>
                  </FieldLabel>
                  <Input
                    id="pw-passphrase-confirm"
                    type="password"
                    autoComplete="new-password"
                    className="font-mono"
                    value={protection.confirmPassphrase}
                    onChange={(event) => protection.setConfirmPassphrase(event.target.value)}
                    aria-invalid={!!protection.error}
                  />
                </div>
                {protection.error ? (
                  <p role="alert" className="text-destructive text-xs">
                    {protection.error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!protection.needsPassword}
                  pending={protection.isEncrypting}
                >
                  <FiLock aria-hidden="true" />
                  {protection.isEncrypting ? t`Protecting paper wallet…` : t`Protect paper wallet`}
                </Button>
              </>
            ) : null}
            <p
              className={cn(
                "text-xs",
                protection.enabled ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {protection.enabled ? (
                protection.isProtected ? (
                  <Trans>
                    Paper wallet is protected. Keep the password separate from the card.
                  </Trans>
                ) : (
                  <Trans>Enter and apply a password before downloading this card.</Trans>
                )
              ) : (
                <Trans>QR currently contains the raw private key.</Trans>
              )}
            </p>
          </form>
        </div>
        <FormFoot>
          <BackButton to="location" redirectTo={redirectTo} />
          <Button disabled={!protection.isReady} onClick={() => onPage("save")}>
            <Trans>Continue</Trans>
          </Button>
        </FormFoot>
      </SetupFrame>
    );
  }

  if (page === "save") {
    return (
      <SetupFrame frame={frame}>
        <div className="flex min-w-0 items-center gap-3">
          <DeskTitle>
            <Trans>Save your card</Trans>
          </DeskTitle>
          <Button
            variant="outline"
            className="ms-auto"
            aria-haspopup="dialog"
            aria-expanded={customizeOpen}
            onClick={() => setCustomizeOpen(true)}
          >
            <Trans>Customize</Trans>
          </Button>
        </div>
        <div className="grid grid-cols-2 items-start gap-4">
          <PaperWalletCardTile
            setup={setup}
            footer={
              protection.isProtected ? (
                <div className="flex justify-end">
                  <Badge size="sm" caps>
                    <FiLock className="me-1 size-2.5" aria-hidden="true" />
                    <Trans>Protected</Trans>
                  </Badge>
                </div>
              ) : null
            }
          />
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={setup.downloaded ? "outline" : "default"}
                className="min-w-0"
                onClick={() => void setup.handleDownload()}
                disabled={setup.busy}
                pending={setup.downloading}
              >
                <RiDownloadLine aria-hidden="true" />
                <span className="truncate">
                  {setup.downloading ? t`Preparing…` : t`Download card`}
                </span>
              </Button>
              <Button
                variant="outline"
                className="min-w-0"
                onClick={() => void setup.handlePrint()}
                disabled={setup.busy}
                pending={setup.printingCard}
              >
                <RiPrinterLine aria-hidden="true" />
                <span className="truncate">{t`Print`}</span>
              </Button>
              {setup.shareSupported ? (
                <Button
                  variant="outline"
                  className="min-w-0"
                  onClick={() => void setup.handleShare()}
                  disabled={setup.busy}
                  pending={setup.sharing}
                >
                  <RiShareLine aria-hidden="true" />
                  <span className="truncate">{setup.sharing ? t`Preparing…` : t`Share card`}</span>
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="min-w-0"
                onClick={() => void setup.handlePrintSheet()}
                disabled={setup.busy}
                pending={setup.printing}
              >
                <span className="truncate">{t`Save printable A4 sheet`}</span>
              </Button>
            </div>
            {setup.downloadError ? (
              <p className="text-destructive text-xs">{setup.downloadError}</p>
            ) : null}
            <AgreementField
              id="signup-saved-key"
              className="mt-2"
              checked={wallet.acked}
              onCheckedChange={wallet.setAcked}
              disabled={!protection.isReady || protection.isEncrypting}
            >
              <span className="text-foreground">
                <Trans>I have saved this key. If lost, my wallet cannot be recovered.</Trans>
              </span>
            </AgreementField>
            {linkPasskey ? null : (
              <TermsAcceptanceField
                id="signup-terms"
                checked={wallet.acceptedTerms}
                onCheckedChange={wallet.setAcceptedTerms}
              />
            )}
            {linkPasskey ? null : finishing}
          </div>
        </div>
        <FormFoot
          note={
            wallet.paperWalletDownloaded ? null : (
              <Trans>Download your paper wallet before continuing.</Trans>
            )
          }
        >
          <BackButton to="card" redirectTo={redirectTo} />
          {linkPasskey ? (
            <Button disabled={!wallet.canContinue} onClick={() => onPage("link")}>
              <Trans>Continue</Trans>
            </Button>
          ) : (
            <Button
              onClick={() => void wallet.handleContinue()}
              disabled={wallet.paperBusy}
              pending={wallet.paperPending}
            >
              <Trans>Continue to wallet</Trans>
            </Button>
          )}
        </FormFoot>
        {customizeOpen ? (
          <PaperWalletCustomizeInspector setup={setup} onClose={() => setCustomizeOpen(false)} />
        ) : null}
      </SetupFrame>
    );
  }

  return (
    <SetupFrame frame={frame}>
      <DeskTitle>{t`Link ${providerLabel}?`}</DeskTitle>
      <p className="max-w-[60ch] text-muted-foreground">
        {t`Every account gets a paper wallet. Linking ${providerLabel} adds another way to sign in.`}
      </p>
      <TermsAcceptanceField
        id="signup-terms"
        checked={wallet.acceptedTerms}
        onCheckedChange={wallet.setAcceptedTerms}
      />
      {finishing}
      <div className="grid grid-cols-2 gap-4">
        <Button
          variant={wallet.linkFailed ? "outline" : "default"}
          className="min-w-0"
          onClick={() => void wallet.handleLinkPasskey()}
          disabled={wallet.linkBusy}
          pending={wallet.linkPending}
        >
          <ProviderIcon aria-hidden="true" />
          <span className="truncate">
            {wallet.passkeyRegistered && (wallet.linkConnectError || wallet.sessionError)
              ? t`Retry ${providerLabel} connection`
              : t`Link wallet to ${providerLabel}`}
          </span>
        </Button>
        <Button
          variant={wallet.linkFailed ? "default" : "outline"}
          className="min-w-0"
          onClick={() => void wallet.handleContinue()}
          disabled={wallet.paperBusy}
          pending={wallet.paperPending}
        >
          <span className="truncate">
            <Trans>Continue with paper wallet</Trans>
          </span>
        </Button>
      </div>
    </SetupFrame>
  );
}

/** Setting up: the account, the passkey or smart wallet, the network, the wallet. */
function SettingUp({
  path,
  phase,
  status,
}: {
  path: "passkey" | "paper";
  phase: number;
  status: string | null;
}) {
  const { t } = useLingui();
  const labels =
    path === "passkey"
      ? [t`Account`, t`Passkey`, t`Network`, t`Wallet`]
      : [t`Account`, t`Paper wallet`, t`Network`, t`Wallet`];

  return (
    <>
      <div className="flex items-center gap-3.5">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <Spinner className="size-5.5" />
        </span>
        <div className="min-w-0">
          <DeskTitle>
            <Trans>Setting up your wallet…</Trans>
          </DeskTitle>
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {status ?? <Trans>Waiting for blockchain confirmation…</Trans>}
          </p>
        </div>
      </div>
      <div className="max-w-130 border border-border bg-card p-4">
        <DeskStepper label={t`Setting up your wallet…`}>
          {labels.map((label, index) => (
            <DeskStep
              key={label}
              index={index + 1}
              label={label}
              state={index < phase ? "complete" : index === phase ? "loading" : "upcoming"}
              description={
                index < phase ? (
                  <Trans>Done</Trans>
                ) : index === phase && index === 2 ? (
                  <Trans>Confirming</Trans>
                ) : (
                  <Trans>Pending</Trans>
                )
              }
            />
          ))}
        </DeskStepper>
      </div>
    </>
  );
}
