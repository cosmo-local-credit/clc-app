import type { IdentityAvailability } from "@clc/api/features/identity/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import type { ProfileInput } from "@clc/core/features/signup/logic";
import { profileSchema } from "@clc/core/features/signup/logic";
import { optionalEmailSchema, optionalPhoneSchema } from "@clc/core/lib/contact";
import { useForm, useStore } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiMoneyDollarCircleLine } from "react-icons/ri";

import { OnboardingScreen, OnboardingTitle } from "#/components/onboarding-screen";
import { ProfilePrivacyNotice } from "#/components/profile-privacy-notice";
import { UsernameInput, type UsernameOccupancy } from "#/components/profile/username-input";
import { ActionRow } from "#/components/ui/action-row";
import { AvatarPicker } from "#/components/ui/avatar-picker";
import { Button } from "#/components/ui/button";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PhoneInputField } from "#/components/ui/phone-input";
import { SettingsSheet } from "#/components/ui/settings-sheet";
import { StepProgress } from "#/components/ui/step-progress";
import { Textarea } from "#/components/ui/textarea";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { identityClient } from "#/lib/api/identity";
import { isStorageConfigured } from "#/lib/api/storage";
import { onboardingSearch, type ProfilePage } from "#/lib/onboarding-search";
import {
  DEFAULT_PREFERRED_CURRENCY,
  preferredCurrencyForCountry,
  resolveProfileCountry,
} from "#/lib/profile-currency";
import { translateValidationError } from "#/lib/validation-i18n";
import { useFirstInvalidFieldFocus } from "#/lib/use-first-invalid-field-focus";
import { useIPCamera } from "#/features/home/hooks/use-ip-camera";

type Props = {
  /** Which third of the profile is on screen; the form and its values span all three. */
  page: ProfilePage;
  initialValues?: ProfileInput;
  /** Carried back in when the user returns to this step. */
  initialAvatarFile?: File | null;
  redirectTo?: string;
  progressTotal: number;
  /** Moves to the next page of the profile. */
  onPage: (page: Exclude<ProfilePage, "profile">) => void;
  /** A later page was opened before the earlier ones were filled in. */
  onRestart: () => void;
  onNext: (data: ProfileInput, avatarFile: File) => void;
};

type ProfileFormValues = {
  name: string;
  username?: string;
  email: string;
  phone: string;
  location: LocationInput | undefined;
  preferredCurrency: string;
  bio: string;
  website: string;
};

const DEFAULT_VALUES: ProfileFormValues = {
  name: "",
  username: "",
  email: "",
  phone: "",
  location: undefined,
  // Keep first render deterministic; the IP/locale suggestion arrives client-side.
  preferredCurrency: DEFAULT_PREFERRED_CURRENCY,
  bio: "",
  website: "",
};

const PAGES: readonly ProfilePage[] = ["profile", "contact", "location"];

/** The fields each page asks for. The schema's email-or-phone rule reports on email. */
const PAGE_FIELDS: Record<ProfilePage, readonly (keyof ProfileFormValues)[]> = {
  profile: ["name", "username"],
  contact: ["email", "phone", "website", "bio"],
  location: ["location", "preferredCurrency"],
};

/**
 * Valid values for every field, standing in for the pages not being checked.
 * zod runs the email-or-phone rule only once every field parses, so checking
 * Contact against an empty Location would never report a missing email.
 */
const STAND_IN: ProfileFormValues = {
  name: "-",
  username: "",
  email: "member@example.com",
  phone: "",
  location: { lat: 0, lng: 0, locationName: "-", country: "KE" },
  preferredCurrency: DEFAULT_PREFERRED_CURRENCY,
  bio: "",
  website: "",
};

/** The shared profile schema's first message for each of one page's fields. */
function pageErrors(
  page: ProfilePage,
  values: ProfileFormValues,
): Partial<Record<keyof ProfileFormValues, string>> {
  const probe: ProfileFormValues = { ...STAND_IN };
  for (const field of PAGE_FIELDS[page]) Object.assign(probe, { [field]: values[field] });
  const result = profileSchema.safeParse(probe);
  const errors: Partial<Record<keyof ProfileFormValues, string>> = {};
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const field = PAGE_FIELDS[page].find((name) => name === issue.path[0]);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

const pageIsValid = (page: ProfilePage, values: ProfileFormValues) =>
  Object.keys(pageErrors(page, values)).length === 0;

const IDENTITY_CHECK_DEBOUNCE_MS = 300;

/** Stable English ids. translateValidationError is what shows them. */
const TAKEN_IDENTITY = {
  email: "That email is already linked to an account",
  phone: "That phone number is already linked to an account",
  username: "That username is already taken",
} as const;

type IdentityField = keyof typeof TAKEN_IDENTITY;

type IdentityProbe = {
  key: string;
  fields: Partial<Record<IdentityField, string>>;
};

/**
 * Locally valid, non-empty email and phone. Invalid text stays on the schema
 * gate. The username field checks its own occupancy.
 */
function identityProbe(values: ProfileFormValues): IdentityProbe {
  const fields: IdentityProbe["fields"] = {};
  const email = optionalEmailSchema.safeParse(values.email);
  if (email.success && email.data) fields.email = email.data.toLowerCase();
  const phone = optionalPhoneSchema.safeParse(values.phone);
  if (phone.success && phone.data) fields.phone = phone.data;
  const active = Boolean(fields.email || fields.phone);
  return {
    key: active ? JSON.stringify([fields.email ?? null, fields.phone ?? null]) : "",
    fields,
  };
}

function takenIdentities(
  result: IdentityAvailability,
  fields: IdentityProbe["fields"],
): Partial<Record<IdentityField, string>> {
  const taken: Partial<Record<IdentityField, string>> = {};
  if (fields.email && result.email?.available === false) taken.email = TAKEN_IDENTITY.email;
  if (fields.phone && result.phone?.available === false) taken.phone = TAKEN_IDENTITY.phone;
  return taken;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Create account, in three short pages that each fit a phone: who you are
 * (photo, name, username), how to reach you (email, phone, website, bio), and
 * where you are (place and currency). One form holds all three, validated by
 * the same profileSchema; Continue checks only the page on screen, and the
 * last page submits the whole profile as one did before.
 */
export function OnboardingProfileForm({
  page,
  initialValues,
  initialAvatarFile,
  redirectTo,
  progressTotal,
  onPage,
  onRestart,
  onNext,
}: Props) {
  const { i18n, t } = useLingui();
  // Outside the form: profileSchema lives in @clc/core, which is React Native
  // compatible and cannot name a browser File. AvatarPicker validates the file;
  // this step also requires one before advancing.
  const [avatarFile, setAvatarFile] = useState<File | null>(initialAvatarFile ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // A page shows its errors once its Continue has been pressed, or a field once
  // it has been touched, so a page never opens on errors from another one.
  const [attempted, setAttempted] = useState<ReadonlySet<ProfilePage>>(() => new Set());
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const approximateCamera = useIPCamera().data;
  const { formRef, focusFirstInvalidField } = useFirstInvalidFieldFocus();
  const currencyWasChosenRef = useRef(Boolean(initialValues?.preferredCurrency));
  const currencyWasSuggestedByLocationRef = useRef(
    Boolean(initialValues?.location && !initialValues?.preferredCurrency),
  );
  // The phone field's dialling code follows the same country the currency does.
  // It is state rather than a ref because PhoneInputField renders from it.
  const [suggestedCountry, setSuggestedCountry] = useState<string | null>(
    initialValues?.location?.country ?? null,
  );

  const form = useForm({
    defaultValues: initialValues ?? DEFAULT_VALUES,
    validators: { onChange: profileSchema },
    onSubmit: async ({ value }) => {
      if (!avatarFile || !isStorageConfigured) return;
      const parsed = profileSchema.parse(value);
      if (!parsed.username) delete parsed.username;
      onNext(parsed, avatarFile);
    },
  });

  // IP is deliberately just a convenience: it may be a VPN, a mobile carrier,
  // or a shared connection. Until the person chooses a currency themselves, a
  // selected profile location can refine the initial network/locale suggestion.
  useEffect(() => {
    const initialLocation = form.getFieldValue("location");
    if (initialLocation) {
      suggestForCountry(initialLocation.country);
      return;
    }

    const controller = new AbortController();
    void resolveProfileCountry(controller.signal).then((country) => {
      if (controller.signal.aborted || !country) return;
      // The phone prefix is seeded whatever the currency did: a saved currency
      // preference says nothing about which dialling code to start on.
      setSuggestedCountry((current) => current ?? country);
      if (
        initialValues?.preferredCurrency ||
        currencyWasChosenRef.current ||
        currencyWasSuggestedByLocationRef.current
      ) {
        return;
      }
      form.setFieldValue("preferredCurrency", preferredCurrencyForCountry(country), {
        dontUpdateMeta: true,
      });
    });
    return () => controller.abort();
  }, [form, initialValues?.preferredCurrency]);

  // A deep link or a reload can land on a later page with an empty form.
  useEffect(() => {
    const earlier = PAGES.slice(0, PAGES.indexOf(page));
    if (earlier.length === 0) return;
    const values = form.state.values;
    if (!avatarFile || earlier.some((previous) => !pageIsValid(previous, values))) onRestart();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the page changes
  }, [page]);

  /** A chosen location is a better hint than the network, for both fields. */
  function suggestForCountry(country: string) {
    setSuggestedCountry(country);
    if (currencyWasChosenRef.current) return;
    currencyWasSuggestedByLocationRef.current = true;
    form.setFieldValue("preferredCurrency", preferredCurrencyForCountry(country), {
      dontUpdateMeta: true,
    });
  }

  const values = useStore(form.store, (state) => state.values);
  const errors = useMemo(() => pageErrors(page, values), [page, values]);
  const probe = identityProbe(values);
  const fieldsRef = useRef(probe.fields);
  fieldsRef.current = probe.fields;
  const [availability, setAvailability] = useState<{
    key: string;
    taken: Partial<Record<IdentityField, string>>;
  } | null>(null);
  // The username field checks itself. This is what Continue waits on.
  const [usernameOccupancy, setUsernameOccupancy] = useState<UsernameOccupancy>({
    checking: false,
    taken: false,
  });
  const onUsernameOccupancy = useCallback((next: UsernameOccupancy) => {
    setUsernameOccupancy((current) =>
      current.checking === next.checking && current.taken === next.taken ? current : next,
    );
  }, []);

  // A check that is still settling must not keep the previous value's message,
  // and it must not let Continue through to the paper wallet.
  useEffect(() => {
    if (!probe.key) return;
    const key = probe.key;
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const fields = fieldsRef.current;
      void identityClient.getAvailability(fields, { signal: controller.signal }).then(
        (result) => {
          if (cancelled) return;
          setAvailability({ key, taken: takenIdentities(result, fields) });
        },
        (error: unknown) => {
          if (cancelled || isAbortError(error)) return;
          setAvailability({ key, taken: {} });
        },
      );
    }, IDENTITY_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [probe.key]);

  const settled = availability?.key === probe.key ? availability.taken : undefined;
  const checking = probe.key !== "" && availability?.key !== probe.key;
  const contactConcern = Boolean(probe.fields.email || probe.fields.phone);
  const usernameBlocked = usernameOccupancy.checking || usernameOccupancy.taken;
  const continueBlocked =
    page === "profile"
      ? usernameBlocked
      : page === "contact"
        ? contactConcern && (checking || Boolean(settled?.email || settled?.phone))
        : usernameBlocked ||
          (contactConcern && (checking || Boolean(settled?.email || settled?.phone)));
  const locationTaken =
    settled?.email ??
    settled?.phone ??
    (usernameOccupancy.taken ? TAKEN_IDENTITY.username : undefined);
  const identityNotice =
    page === "location" && locationTaken ? translateValidationError(locationTaken, i18n) : null;

  async function handleContinue() {
    if (continueBlocked) return;
    setAttempted((current) => new Set(current).add(page));
    const missingPhoto = page === "profile" && !avatarFile;
    if (missingPhoto) setPhotoError(t`Required`);
    if (missingPhoto || !pageIsValid(page, form.state.values)) {
      focusFirstInvalidField();
      return;
    }
    if (page === "profile") onPage("contact");
    else if (page === "contact") onPage("location");
    else await form.handleSubmit().finally(focusFirstInvalidField);
  }

  /** The translated error a field shows. A taken identity shows immediately. */
  function shownError(name: keyof ProfileFormValues, touched: boolean) {
    const taken = name === "email" ? settled?.email : name === "phone" ? settled?.phone : undefined;
    if (taken) return translateValidationError(taken, i18n);
    if (!touched && !attempted.has(page)) return null;
    const err = errors[name];
    if (!err) return null;
    return err === "Name is required" ? t`Required` : translateValidationError(err, i18n);
  }

  const previous = page === "location" ? "contact" : page === "contact" ? "profile" : "welcome";
  const title =
    page === "profile" ? (
      <Trans>Create your account</Trans>
    ) : page === "contact" ? (
      <Trans>Contact</Trans>
    ) : (
      <Trans>Location</Trans>
    );

  return (
    <OnboardingScreen
      start={
        <BackChevron
          label={t`Back`}
          to="/onboarding"
          search={onboardingSearch(previous, redirectTo)}
        />
      }
      footer={
        <>
          {identityNotice ? (
            <p className="text-center text-destructive text-xs" role="alert">
              {identityNotice}
            </p>
          ) : null}
          <Button
            type="submit"
            form="onboarding-profile"
            disabled={!isStorageConfigured || continueBlocked}
            tap
            className="w-full"
          >
            <Trans>Continue</Trans>
          </Button>
          {page === "profile" ? (
            <p className="text-center text-muted-foreground text-xs">
              <Trans>Already have an account?</Trans>{" "}
              <Link
                to="/onboarding"
                search={onboardingSearch("signin", redirectTo)}
                replace
                className="font-medium text-foreground underline underline-offset-4"
              >
                <Trans>Go back to sign in</Trans>
              </Link>
            </p>
          ) : null}
        </>
      }
    >
      <StepProgress step={PAGES.indexOf(page) + 1} total={progressTotal} className="" />
      <OnboardingTitle>{title}</OnboardingTitle>

      <form
        id="onboarding-profile"
        ref={formRef}
        aria-label={t`Create account`}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleContinue();
        }}
        className={
          page === "location" ? "flex min-h-0 flex-1 flex-col gap-4" : "flex flex-col gap-4"
        }
      >
        {page === "profile" ? (
          <>
            <AvatarPicker
              value={avatarFile}
              onChange={(file) => {
                setPhotoError(null);
                setAvatarFile(file);
              }}
              required
              disabled={!isStorageConfigured}
              validationError={photoError}
            />
            {!isStorageConfigured ? (
              <p className="text-destructive text-xs" role="alert">
                {t`Photo uploads are unavailable right now.`}
              </p>
            ) : null}

            <form.Field name="name">
              {(field) => {
                const err = shownError("name", field.state.meta.isTouched);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="onb-name" className="font-medium text-sm">
                      <Trans>Name</Trans>
                    </label>
                    <Input
                      id="onb-name"
                      type="text"
                      autoComplete="name"
                      placeholder={t`Your name`}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={!!err}
                      aria-label={t`Name`}
                    />
                    {err ? <p className="text-destructive text-xs">{err}</p> : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="username">
              {(field) => (
                <UsernameInput
                  id="onb-username"
                  value={field.state.value ?? ""}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  onOccupancy={onUsernameOccupancy}
                  error={shownError("username", field.state.meta.isTouched)}
                />
              )}
            </form.Field>
          </>
        ) : null}

        {page === "contact" ? (
          <>
            <ProfilePrivacyNotice />
            <form.Field name="email">
              {(field) => {
                const err = shownError("email", field.state.meta.isTouched);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="onb-email" className="font-medium text-sm">
                      <Trans>Email</Trans>
                    </label>
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
                      aria-label={t`Email`}
                    />
                    {err ? <p className="text-destructive text-xs">{err}</p> : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="phone">
              {(field) => {
                const err = shownError("phone", field.state.meta.isTouched);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="onb-phone" className="font-medium text-sm">
                      <Trans>Phone</Trans>
                    </label>
                    <PhoneInputField
                      id="onb-phone"
                      defaultCountry={suggestedCountry}
                      value={field.state.value}
                      onChange={(val) => field.handleChange(val)}
                      aria-invalid={!!err}
                      aria-label={t`Phone number`}
                    />
                    {err ? <p className="text-destructive text-xs">{err}</p> : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="website">
              {(field) => {
                const err = shownError("website", field.state.meta.isTouched);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="onb-website" className="font-medium text-sm">
                      <Trans>Website</Trans>
                      <span className="ms-1 font-normal text-muted-foreground">
                        <Trans>Optional</Trans>
                      </span>
                    </label>
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
                      aria-label={t`Website`}
                    />
                    {err ? <p className="text-destructive text-xs">{err}</p> : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="bio">
              {(field) => {
                const err = shownError("bio", field.state.meta.isTouched);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="onb-bio" className="font-medium text-sm">
                      <Trans>Bio</Trans>
                      <span className="ms-1 font-normal text-muted-foreground">
                        <Trans>Optional</Trans>
                      </span>
                    </label>
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
                    {err ? <p className="text-destructive text-xs">{err}</p> : null}
                  </div>
                );
              }}
            </form.Field>
          </>
        ) : null}

        {page === "location" ? (
          <>
            <form.Field name="location">
              {(field) => (
                <LocationPicker
                  required
                  fill
                  cameraHint={approximateCamera}
                  value={field.state.value}
                  onChange={(next) => {
                    field.handleChange(next);
                    if (next) suggestForCountry(next.country);
                  }}
                  error={shownError("location", field.state.meta.isTouched) ?? undefined}
                />
              )}
            </form.Field>

            <form.Field name="preferredCurrency">
              {(field) => {
                const err = shownError("preferredCurrency", field.state.meta.isTouched);
                return (
                  <div className="shrink-0">
                    <div className="border border-border bg-card">
                      <ActionRow
                        icon={<RiMoneyDollarCircleLine className="size-4" aria-hidden="true" />}
                        label={t`Preferred unit of account`}
                        value={<span className="font-mono">{field.state.value}</span>}
                        onClick={() => setCurrencyOpen(true)}
                      />
                    </div>
                    {err ? <p className="mt-1 text-destructive text-xs">{err}</p> : null}
                    <SettingsSheet
                      open={currencyOpen}
                      onOpenChange={setCurrencyOpen}
                      title={t`Preferred unit of account`}
                    >
                      <UnitOfAccountCombobox
                        id="onb-preferred-currency"
                        value={field.state.value}
                        onValueChange={(currency) => {
                          currencyWasChosenRef.current = true;
                          field.handleChange(currency);
                          setCurrencyOpen(false);
                        }}
                        placeholder={t`Search units of account`}
                        emptyMessage={t`No units of account found`}
                        ariaLabel={t`Preferred unit of account`}
                        ariaInvalid={!!err}
                      />
                    </SettingsSheet>
                  </div>
                );
              }}
            </form.Field>
          </>
        ) : null}
      </form>
    </OnboardingScreen>
  );
}
