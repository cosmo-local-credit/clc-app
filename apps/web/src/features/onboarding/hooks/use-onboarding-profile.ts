import type { LocationInput } from "@clc/core/features/location/logic";
import type { ProfileInput } from "@clc/core/features/signup/logic";
import { profileSchema } from "@clc/core/features/signup/logic";
import { useForm, useStore } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";

import { useIPCamera } from "#/features/home/hooks/use-ip-camera";
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

  async function handleContinue() {
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

  /** The translated error a field shows, once its page has been tried or it has been touched. */
  function shownError(name: keyof ProfileFormValues, touched: boolean) {
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
    previous,
    /** The person picked a currency themselves; the location stops suggesting one. */
    markCurrencyChosen: () => {
      currencyWasChosenRef.current = true;
    },
  };
}
