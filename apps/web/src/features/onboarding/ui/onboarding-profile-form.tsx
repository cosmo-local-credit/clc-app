import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiMoneyDollarCircleLine } from "react-icons/ri";

import { OnboardingScreen, OnboardingTitle } from "#/components/onboarding-screen";
import { ProfilePrivacyNotice } from "#/components/profile-privacy-notice";
import { UsernameInput } from "#/components/profile/username-input";
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
import {
  type UseOnboardingProfileOptions,
  useOnboardingProfile,
} from "#/features/onboarding/hooks/use-onboarding-profile";
import { isStorageConfigured } from "#/lib/api/storage";
import { onboardingSearch, type ProfilePage } from "#/lib/onboarding-search";

type Props = UseOnboardingProfileOptions & {
  redirectTo?: string;
  progressTotal: number;
};

const PAGES: readonly ProfilePage[] = ["profile", "contact", "location"];

/**
 * Create account, in three short pages that each fit a phone: who you are
 * (photo, name, username), how to reach you (email, phone, website, bio), and
 * where you are (place and currency). One form holds all three, validated by
 * the same profileSchema; Continue checks only the page on screen, and the
 * last page submits the whole profile as one did before.
 */
export function OnboardingProfileForm({ redirectTo, progressTotal, ...options }: Props) {
  const { page } = options;
  const { t } = useLingui();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const {
    form,
    avatarFile,
    setAvatarFile,
    photoError,
    approximateCamera,
    formRef,
    suggestedCountry,
    suggestForCountry,
    shownError,
    handleContinue,
    continueBlocked,
    identityNotice,
    previous,
    markCurrencyChosen,
  } = useOnboardingProfile(options);

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
              onChange={setAvatarFile}
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
                  hint={() => form.getFieldValue("name")}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
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
                          markCurrencyChosen();
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
