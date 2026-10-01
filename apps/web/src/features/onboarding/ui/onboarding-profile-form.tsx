import type { LocationInput } from "@clc/core/features/location/logic";
import type { ProfileInput } from "@clc/core/features/signup/logic";
import { profileSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { OnboardingMenu } from "#/components/language-selector";
import { AvatarPicker } from "#/components/ui/avatar-picker";
import { Button } from "#/components/ui/button";
import { CurrencySelect } from "#/components/ui/currency-select";
import { Input } from "#/components/ui/input";
import { UsernameInput } from "#/components/ui/username-input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PhoneInputField } from "#/components/ui/phone-input";
import { StepProgress } from "#/components/ui/step-progress";
import { Textarea } from "#/components/ui/textarea";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { isStorageConfigured } from "#/lib/api/storage";
import { onboardingSearch } from "#/lib/onboarding-search";
import {
  DEFAULT_PREFERRED_CURRENCY,
  preferredCurrencyForCountry,
  resolveProfileCountry,
} from "#/lib/profile-currency";
import { translateValidationError } from "#/lib/validation-i18n";

type Props = {
  initialValues?: ProfileInput;
  /** Carried back in when the user returns to this step. */
  initialAvatarFile?: File | null;
  redirectTo?: string;
  progressStep: number;
  progressTotal: number;
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

export function OnboardingProfileForm({
  initialValues,
  initialAvatarFile,
  redirectTo,
  progressStep,
  progressTotal,
  onNext,
}: Props) {
  const { i18n, t } = useLingui();
  // Outside the form: profileSchema lives in @clc/core, which is React Native
  // compatible and cannot name a browser File. AvatarPicker validates the file;
  // this step also requires one before advancing.
  const [avatarFile, setAvatarFile] = useState<File | null>(initialAvatarFile ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
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

  /** A chosen location is a better hint than the network, for both fields. */
  function suggestForCountry(country: string) {
    setSuggestedCountry(country);
    if (currencyWasChosenRef.current) return;
    currencyWasSuggestedByLocationRef.current = true;
    form.setFieldValue("preferredCurrency", preferredCurrencyForCountry(country), {
      dontUpdateMeta: true,
    });
  }

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background">
      <OnboardingMenu />
      <div className="flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <BackChevron
          label={t`Back`}
          to="/onboarding"
          search={onboardingSearch("welcome", redirectTo)}
          className="mb-4 self-start"
        />

        <StepProgress step={progressStep} total={progressTotal} />

        <div className="mb-4">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Create your account</Trans>
          </h1>
        </div>

        <form
          aria-label={t`Create account`}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!avatarFile) setPhotoError(t`Add a profile photo to continue.`);
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-4 border border-border bg-card p-4">
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
                const err = getFieldError(field.state.meta.errors);
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
                    {err ? (
                      <p className="text-destructive text-xs">
                        {translateValidationError(err, i18n)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="username">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <div>
                    <UsernameInput
                      id="onb-username"
                      value={field.state.value ?? ""}
                      hint={() => form.getFieldValue("name")}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      invalid={!!err}
                    />
                    {err ? (
                      <p className="text-destructive text-xs">
                        {translateValidationError(err, i18n)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="email">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
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
                    {err ? (
                      <p className="text-destructive text-xs">
                        {translateValidationError(err, i18n)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="phone">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
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
                    {err ? (
                      <p className="text-destructive text-xs">
                        {translateValidationError(err, i18n)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="preferredCurrency">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="onb-preferred-currency" className="font-medium text-sm">
                      <Trans>Preferred currency</Trans>
                    </label>
                    <CurrencySelect
                      id="onb-preferred-currency"
                      value={field.state.value}
                      onValueChange={(currency) => {
                        currencyWasChosenRef.current = true;
                        field.handleChange(currency);
                      }}
                      placeholder={t`Search currencies`}
                      emptyMessage={t`No currencies found`}
                      ariaLabel={t`Preferred currency`}
                    />
                    {err ? (
                      <p className="text-destructive text-xs">
                        {translateValidationError(err, i18n)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="bio">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
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
                    {err ? (
                      <p className="text-destructive text-xs">
                        {translateValidationError(err, i18n)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="website">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
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
                    {err ? (
                      <p className="text-destructive text-xs">
                        {translateValidationError(err, i18n)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>
          </div>

          <form.Field name="location">
            {(field) => {
              const err = getFieldError(field.state.meta.errors);
              return (
                <form.Subscribe selector={(s) => s.submissionAttempts}>
                  {(submissionAttempts) => (
                    <LocationPicker
                      value={field.state.value}
                      onChange={(next) => {
                        field.handleChange(next);
                        if (next) suggestForCountry(next.country);
                      }}
                      error={
                        field.state.meta.isTouched || submissionAttempts > 0
                          ? err
                            ? translateValidationError(err, i18n)
                            : undefined
                          : undefined
                      }
                    />
                  )}
                </form.Subscribe>
              );
            }}
          </form.Field>

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                disabled={isSubmitting || !isStorageConfigured}
                className="h-11 w-full"
              >
                {isSubmitting ? <LoaderCircle className="me-2 size-4 animate-spin" /> : null}
                {isSubmitting ? t`Saving…` : t`Continue`}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <p className="mt-8 text-center text-muted-foreground text-sm">
          <Trans>Already have an account?</Trans>{" "}
          <Link
            to="/onboarding"
            search={onboardingSearch("signin", redirectTo)}
            replace
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            <Trans>Go back to sign in</Trans>
          </Link>
        </p>
      </div>
    </div>
  );
}
