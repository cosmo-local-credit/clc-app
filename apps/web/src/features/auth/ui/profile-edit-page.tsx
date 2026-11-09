import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { ProfilePrivacyNotice } from "#/components/profile-privacy-notice";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PhoneInputField } from "#/components/ui/phone-input";
import { Textarea } from "#/components/ui/textarea";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { type ProfileResult } from "@clc/api/features/auth/client";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useProfileEditForm } from "#/features/auth/hooks/use-profile-edit-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { translateValidationError } from "#/lib/validation-i18n";

import { ProfileUsernameSection } from "./profile-username-section";

export function ProfileEditPage() {
  const { t } = useLingui();
  const profileQuery = useAuthProfile();

  return (
    // Bottom padding is exactly the navigation's height: the save bar sits flush
    // on top of it, and the navigation carries the safe-area inset.
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[var(--bottom-nav-offset)]">
      <BackChevron label={t`Settings`} to="/" search={{ tab: "settings" }} />

      <h1 className="mb-6 font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Edit profile</Trans>
      </h1>

      {profileQuery.isPending ? (
        <ProfileEditSkeleton />
      ) : profileQuery.isError ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-muted-foreground text-sm">
            <Trans>We couldn't load your profile.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={profileQuery.isFetching}
            onClick={() => void profileQuery.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : (
        <ProfileEditForm profile={profileQuery.data} />
      )}
    </div>
  );
}

function ProfileEditForm({ profile }: { profile: ProfileResult }) {
  const { i18n, t } = useLingui();
  const {
    form,
    avatarUrl,
    setAvatarUrl,
    avatarChanged,
    avatarBusy,
    setAvatarBusy,
    submitError,
    inFlight,
  } = useProfileEditForm(profile);

  return (
    // The username section sits outside the <form>: its sheet portals out of
    // the DOM, but a React submit event would still bubble to this form.
    <>
      <ProfileUsernameSection profile={profile} />
      <ProfilePrivacyNotice className="mt-4" />

      <form
        aria-label={t`Edit profile`}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
        className="mt-6 flex flex-1 flex-col"
      >
        <div className="space-y-6 pb-6">
          <div className="space-y-4 border border-border bg-card p-4">
            {/* Hidden rather than disabled when the upload service is not configured:
              a control that cannot work is worse than no control. */}
            {isStorageConfigured ? (
              <ImageUploadField
                label={t`Profile photo`}
                hint={t`Optional`}
                purpose="profile.avatar"
                value={avatarUrl}
                onChange={setAvatarUrl}
                onBusyChange={setAvatarBusy}
                disabled={inFlight}
              />
            ) : null}

            <form.Field name="name">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="profile-name" className="font-medium text-sm">
                      <Trans>Name</Trans>
                    </label>
                    <Input
                      id="profile-name"
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

            <form.Field name="bio">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="profile-bio" className="font-medium text-sm">
                      <Trans>Bio</Trans>
                      <span className="ms-1 font-normal text-muted-foreground">
                        <Trans>Optional</Trans>
                      </span>
                    </label>
                    <Textarea
                      id="profile-bio"
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
                    <label htmlFor="profile-website" className="font-medium text-sm">
                      <Trans>Website</Trans>
                      <span className="ms-1 font-normal text-muted-foreground">
                        <Trans>Optional</Trans>
                      </span>
                    </label>
                    <Input
                      id="profile-website"
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

          <div className="space-y-4 border border-border bg-card p-4">
            <form.Field name="email">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="profile-email" className="font-medium text-sm">
                      <Trans>Email</Trans>
                    </label>
                    <Input
                      id="profile-email"
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
                    <label htmlFor="profile-phone" className="font-medium text-sm">
                      <Trans>Phone</Trans>
                    </label>
                    <PhoneInputField
                      id="profile-phone"
                      defaultCountry={profile.country}
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
          </div>

          <div className="space-y-4 border border-border bg-card p-4">
            <form.Field name="location">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <form.Subscribe selector={(s) => s.submissionAttempts}>
                    {(submissionAttempts) => (
                      <div className="space-y-3">
                        <LocationPicker
                          value={field.state.value}
                          onChange={(next) => field.handleChange(next)}
                          error={
                            field.state.meta.isTouched || submissionAttempts > 0
                              ? err
                                ? translateValidationError(err, i18n)
                                : undefined
                              : undefined
                          }
                        />
                        {field.state.value ? (
                          <Button
                            type="button"
                            variant="outline"
                            tap
                            className="w-full"
                            onClick={() => field.handleChange(undefined)}
                          >
                            <Trans>Clear location</Trans>
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </form.Subscribe>
                );
              }}
            </form.Field>

            <form.Field name="preferredCurrency">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="profile-preferred-currency" className="font-medium text-sm">
                      <Trans>Preferred unit of account</Trans>
                    </label>
                    <UnitOfAccountCombobox
                      id="profile-preferred-currency"
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      placeholder={t`Search units of account`}
                      emptyMessage={t`No units of account found`}
                      ariaLabel={t`Preferred unit of account`}
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
        </div>

        {/* Pinned above the navigation so Save is reachable from any field,
            and pushed there by mt-auto when the form is short. */}
        <div className="sticky bottom-[var(--bottom-nav-offset)] z-20 -mx-6 mt-auto border-border border-t bg-card px-6 py-3">
          {submitError ? (
            <p role="alert" className="mb-2 text-destructive text-xs">
              {submitError}
            </p>
          ) : null}
          <form.Subscribe
            selector={(s) => ({
              isSubmitting: s.isSubmitting,
              canSubmit: s.canSubmit,
              isDirty: s.isDirty,
            })}
          >
            {({ isSubmitting, canSubmit, isDirty }) => (
              // Disabled until something changed, and while the photo uploads,
              // or a submit would save the URL the page held before the new
              // file finished.
              <Button
                type="submit"
                disabled={!(isDirty || avatarChanged) || !canSubmit}
                pending={isSubmitting || avatarBusy || inFlight}
                tap
                className="w-full"
              >
                {avatarBusy
                  ? t`Uploading photo…`
                  : isSubmitting || inFlight
                    ? t`Saving…`
                    : t`Save changes`}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </>
  );
}

function ProfileEditSkeleton() {
  return (
    <div className="space-y-6 pb-6">
      <div className="h-11 w-full border border-border bg-card" />
      <div className="space-y-4 border border-border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-24 bg-muted" />
          <div className="size-20 rounded-full bg-muted" />
        </div>
        {["name", "bio", "website"].map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="h-4 w-16 bg-muted" />
            <div className="h-9 w-full bg-muted" />
          </div>
        ))}
      </div>
      <div className="space-y-4 border border-border bg-card p-4">
        {["email", "phone"].map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="h-4 w-16 bg-muted" />
            <div className="h-9 w-full bg-muted" />
          </div>
        ))}
      </div>
      <div className="space-y-4 border border-border bg-card p-4">
        <div className="h-52 w-full bg-muted" />
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-28 bg-muted" />
          <div className="h-9 w-full bg-muted" />
        </div>
      </div>
    </div>
  );
}
