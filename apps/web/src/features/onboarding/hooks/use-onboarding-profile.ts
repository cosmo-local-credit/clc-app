import type { IdentityAvailability } from "@clc/api/features/identity/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import type { ProfileInput } from "@clc/core/features/signup/logic";
import { profileSchema, usernameSchema } from "@clc/core/features/signup/logic";
import { optionalEmailSchema, optionalPhoneSchema } from "@clc/core/lib/contact";
import { useForm, useStore } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";

import { useIPCamera } from "#/features/home/hooks/use-ip-camera";
import { identityClient } from "#/lib/api/identity";
import { isStorageConfigured } from "#/lib/api/storage";
import type { ProfilePage } from "#/lib/onboarding-search";
import {
  DEFAULT_PREFERRED_CURRENCY,
  preferredCurrencyForCountry,
  resolveProfileCountry,
} from "#/lib/profile-currency";
import { useFirstInvalidFieldFocus } from "#/lib/use-first-invalid-field-focus";
import { translateValidationError } from "#/lib/validation-i18n";

export type UseOnboardingProfileOptions = {
  /** Which third of the profile is on screen; the form and its values span all three. */
  page: ProfilePage;
  initialValues?: ProfileInput;
  /** Carried back in when the user returns to this step. */
  initialAvatarFile?: File | null;
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

/** Locally valid, non-empty identities. Invalid text stays on the schema gate. */
function identityProbe(values: ProfileFormValues): IdentityProbe {
  const fields: IdentityProbe["fields"] = {};
  const email = optionalEmailSchema.safeParse(values.email);
  if (email.success && email.data) fields.email = email.data.toLowerCase();
  const phone = optionalPhoneSchema.safeParse(values.phone);
  if (phone.success && phone.data) fields.phone = phone.data;
  const username = usernameSchema.safeParse(values.username ?? "");
  if (username.success && username.data) fields.username = username.data;
  const active = Boolean(fields.email || fields.phone || fields.username);
  return {
    key: active
      ? JSON.stringify([fields.email ?? null, fields.phone ?? null, fields.username ?? null])
      : "",
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
  if (fields.username && result.username?.available === false) {
    taken.username = TAKEN_IDENTITY.username;
  }
  return taken;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Create account, in three short pages: who you are (photo, name, username),
 * how to reach you (email, phone, website, bio), and where you are (place and
 * currency). One form holds all three, validated by the same profileSchema;
 * Continue checks only the page on screen, and the last page submits the whole
 * profile. The phone screens and the desktop setup steps share it.
 */
export function useOnboardingProfile({
  page,
  initialValues,
  initialAvatarFile,
  onPage,
  onRestart,
  onNext,
}: UseOnboardingProfileOptions) {
  const { i18n, t } = useLingui();
  // Outside the form: profileSchema lives in @clc/core, which is React Native
  // compatible and cannot name a browser File. AvatarPicker validates the file;
  // this step also requires one before advancing.
  const [avatarFile, setAvatarFile] = useState<File | null>(initialAvatarFile ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // A page shows its errors once its Continue has been pressed, or a field once
  // it has been touched, so a page never opens on errors from another one.
  const [attempted, setAttempted] = useState<ReadonlySet<ProfilePage>>(() => new Set());
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

  // A check that is still settling must not keep the previous value's message,
  // and it must not let Continue through to the sign-in card.
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
  const usernameConcern = Boolean(probe.fields.username);
  const contactConcern = Boolean(probe.fields.email || probe.fields.phone);
  const continueBlocked =
    page === "profile"
      ? usernameConcern && (checking || Boolean(settled?.username))
      : page === "contact"
        ? contactConcern && (checking || Boolean(settled?.email || settled?.phone))
        : (usernameConcern || contactConcern) &&
          (checking || Boolean(settled?.email || settled?.phone || settled?.username));
  const locationTaken = settled?.email ?? settled?.phone ?? settled?.username;
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
    const taken =
      name === "email"
        ? settled?.email
        : name === "phone"
          ? settled?.phone
          : name === "username"
            ? settled?.username
            : undefined;
    if (taken) return translateValidationError(taken, i18n);
    if (!touched && !attempted.has(page)) return null;
    const err = errors[name];
    if (!err) return null;
    return err === "Name is required" ? t`Required` : translateValidationError(err, i18n);
  }

  const previous: "contact" | "profile" | "welcome" =
    page === "location" ? "contact" : page === "contact" ? "profile" : "welcome";

  return {
    form,
    avatarFile,
    setAvatarFile: (file: File | null) => {
      setPhotoError(null);
      setAvatarFile(file);
    },
    photoError,
    approximateCamera,
    formRef,
    suggestedCountry,
    suggestForCountry,
    shownError,
    handleContinue,
    /** A taken or still-checking identity holds Continue back. */
    continueBlocked,
    /** Shown on the last page, where the taken identity's own field is out of sight. */
    identityNotice,
    previous,
    /** The person picked a currency themselves; the location stops suggesting one. */
    markCurrencyChosen: () => {
      currencyWasChosenRef.current = true;
    },
  };
}
