import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import type { ProfileResult } from "@clc/api/features/auth/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import { locationSchema } from "@clc/core/features/location/logic";
import { type ProfileEditInput, profileEditSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ProfilePrivacyNotice } from "#/components/profile-privacy-notice";
import { Button } from "#/components/ui/button";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PhoneInputField } from "#/components/ui/phone-input";
import { Textarea } from "#/components/ui/textarea";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useUpdateProfile } from "#/features/auth/hooks/use-update-profile";
import { ProfileUsernameSection } from "#/features/auth/ui/profile-username-section";
import { isStorageConfigured } from "#/lib/api/storage";
import { preferredCurrencyForCountry } from "#/lib/profile-currency";
import { translateRecipientError } from "#/lib/recipient-error-i18n";
import { translateValidationError } from "#/lib/validation-i18n";

const PLACEHOLDER_EMAIL_SUFFIX = "@clc.local";

export function ProfileDesk() {
  const profileQuery = useAuthProfile();

  return (
    <DeskCanvas width="read">
      <DeskTitle>
        <Trans>Edit profile</Trans>
      </DeskTitle>

      <div className="mt-8">
        {profileQuery.isPending ? (
          <div aria-busy="true" className="grid grid-cols-2 gap-8">
            <div className="h-64 border border-border bg-card" />
            <div className="h-64 border border-border bg-card" />
          </div>
        ) : profileQuery.isError ? (
          <div className="space-y-3 border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              <Trans>We couldn't load your profile.</Trans>
            </p>
            <Button
              variant="outline"
              pending={profileQuery.isFetching}
              onClick={() => void profileQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : (
          <ProfileForm profile={profileQuery.data} />
        )}
      </div>
    </DeskCanvas>
  );
}

function ProfileForm({ profile }: { profile: ProfileResult }) {
  const { i18n, t } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const storedAvatarUrl = profile.avatarUrl ?? null;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(storedAvatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const seededLocation = locationSchema.safeParse({
    lat: profile.geoLat,
    lng: profile.geoLng,
    locationName: profile.locationName,
    country: profile.country,
  });
  const initialLocation: LocationInput | undefined = seededLocation.success
    ? seededLocation.data
    : undefined;

  const defaultValues: ProfileEditInput = {
    name: profile.name ?? "",
    email: profile.email.endsWith(PLACEHOLDER_EMAIL_SUFFIX) ? "" : (profile.email ?? ""),
    phone: profile.phone ?? "",
    location: initialLocation,
    preferredCurrency:
      profile.preferredCurrency?.trim() || preferredCurrencyForCountry(profile.country),
    bio: profile.bio ?? "",
    website: profile.website ?? "",
  };

  const form = useForm({
    defaultValues,
    validators: { onChange: profileEditSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const parsed = profileEditSchema.parse(value);
        await updateProfile.mutateAsync({
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          country: parsed.location?.country ?? profile.country,
          preferredCurrency: parsed.preferredCurrency,
          bio: parsed.bio,
          website: parsed.website,
          ...(parsed.location
            ? {
                locationName: parsed.location.locationName,
                geoLat: parsed.location.lat,
                geoLng: parsed.location.lng,
              }
            : { clearLocation: true }),
          ...(avatarUrl !== storedAvatarUrl ? { avatarUrl } : {}),
        });
        toast.success(t`Profile updated`);
        if (canGoBack) {
          router.history.back();
        } else {
          void navigate({ to: "/", search: { tab: "settings" }, replace: true });
        }
      } catch (err) {
        setSubmitError(
          translateRecipientError(err, i18n) ??
            (err instanceof BackendApiError
              ? formatBackendApiError(err)
              : err instanceof Error
                ? err.message
                : t`Couldn't save your profile.`),
        );
      }
    },
  });

  return (
    <>
      <ProfileUsernameSection profile={profile} />
      <ProfilePrivacyNotice />

      <form
        aria-label={t`Edit profile`}
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="grid grid-cols-2 items-start gap-8">
          <div className="space-y-6">
            <div className="space-y-4 border border-border bg-card p-4">
              {isStorageConfigured ? (
                <ImageUploadField
                  label={t`Profile photo`}
                  hint={t`Optional`}
                  purpose="profile.avatar"
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                  onBusyChange={setAvatarBusy}
                  disabled={updateProfile.isPending}
                />
              ) : null}

              <form.Field name="name">
                {(field) => {
                  const err = getFieldError(field.state.meta.errors);
                  return (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="desk-profile-name" className="font-medium text-sm">
                        <Trans>Name</Trans>
                      </label>
                      <Input
                        id="desk-profile-name"
                        type="text"
                        autoComplete="name"
                        placeholder={t`Your name`}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
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
                      <label htmlFor="desk-profile-bio" className="font-medium text-sm">
                        <Trans>Bio</Trans>
                        <span className="ms-1 font-normal text-muted-foreground">
                          <Trans>Optional</Trans>
                        </span>
                      </label>
                      <Textarea
                        id="desk-profile-bio"
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
                      <label htmlFor="desk-profile-website" className="font-medium text-sm">
                        <Trans>Website</Trans>
                        <span className="ms-1 font-normal text-muted-foreground">
                          <Trans>Optional</Trans>
                        </span>
                      </label>
                      <Input
                        id="desk-profile-website"
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
                      <label htmlFor="desk-profile-email" className="font-medium text-sm">
                        <Trans>Email</Trans>
                      </label>
                      <Input
                        id="desk-profile-email"
                        dir="ltr"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
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
                      <label htmlFor="desk-profile-phone" className="font-medium text-sm">
                        <Trans>Phone</Trans>
                      </label>
                      <PhoneInputField
                        id="desk-profile-phone"
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
          </div>

          <div className="space-y-4 border border-border bg-card p-4">
            <form.Field name="location">
              {(field) => {
                const err = getFieldError(field.state.meta.errors);
                return (
                  <form.Subscribe selector={(state) => state.submissionAttempts}>
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
                    <label htmlFor="desk-profile-currency" className="font-medium text-sm">
                      <Trans>Preferred unit of account</Trans>
                    </label>
                    <UnitOfAccountCombobox
                      id="desk-profile-currency"
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

        <div className="mt-6">
          {submitError ? (
            <p role="alert" className="mb-2 text-destructive text-xs">
              {submitError}
            </p>
          ) : null}
          <form.Subscribe
            selector={(state) => ({
              isSubmitting: state.isSubmitting,
              canSubmit: state.canSubmit,
              isDirty: state.isDirty,
            })}
          >
            {({ isSubmitting, canSubmit, isDirty }) => (
              <Button
                type="submit"
                disabled={!(isDirty || avatarUrl !== storedAvatarUrl) || !canSubmit}
                pending={isSubmitting || avatarBusy}
              >
                {avatarBusy ? t`Uploading photo…` : isSubmitting ? t`Saving…` : t`Save changes`}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </>
  );
}
