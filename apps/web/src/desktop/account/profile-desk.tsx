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
import { DeskCanvas, DeskTitle, DeskTitleRow } from "#/desktop/ui/page";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useUpdateProfile } from "#/features/auth/hooks/use-update-profile";
import { ProfileUsernameSection } from "#/features/auth/ui/profile-username-section";
import { isStorageConfigured } from "#/lib/api/storage";
import { preferredCurrencyForCountry } from "#/lib/profile-currency";
import { translateRecipientError } from "#/lib/recipient-error-i18n";
import { cn } from "#/lib/utils";
import { translateValidationError } from "#/lib/validation-i18n";

const PLACEHOLDER_EMAIL_SUFFIX = "@clc.local";

export function ProfileDesk() {
  const profileQuery = useAuthProfile();

  return (
    <DeskCanvas width="read" className="grid-cols-[minmax(0,760px)]">
      {profileQuery.isPending ? (
        <>
          <DeskTitle>
            <Trans>Edit profile</Trans>
          </DeskTitle>
          <div aria-busy="true" className="grid gap-4">
            <div className="h-14 border border-border bg-card" />
            <div className="h-64 border border-border bg-card" />
          </div>
        </>
      ) : profileQuery.isError ? (
        <>
          <DeskTitle>
            <Trans>Edit profile</Trans>
          </DeskTitle>
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
        </>
      ) : (
        <ProfileForm profile={profileQuery.data} />
      )}
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

  const fieldError = (err: string | null | undefined) =>
    err ? <p className="text-destructive text-xs">{translateValidationError(err, i18n)}</p> : null;

  return (
    <>
      <DeskTitleRow
        title={<Trans>Edit profile</Trans>}
        actions={
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
                form={FORM_ID}
                disabled={!(isDirty || avatarUrl !== storedAvatarUrl) || !canSubmit}
                pending={isSubmitting || avatarBusy}
              >
                {avatarBusy ? t`Uploading photo…` : isSubmitting ? t`Saving…` : t`Save changes`}
              </Button>
            )}
          </form.Subscribe>
        }
      />

      {submitError ? (
        <p role="alert" className="text-destructive text-xs">
          {submitError}
        </p>
      ) : null}

      <UsernameRow profile={profile} />

      <form
        id={FORM_ID}
        aria-label={t`Edit profile`}
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
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

        <div className="grid grid-cols-2 items-start gap-4">
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
                  {fieldError(err)}
                </div>
              );
            }}
          </form.Field>

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
                  {fieldError(err)}
                </div>
              );
            }}
          </form.Field>
        </div>

        <div className="grid grid-cols-2 items-start gap-4">
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
                  {fieldError(err)}
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
                    <span className="ms-1.5 font-normal text-muted-foreground text-xs">
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
                  {fieldError(err)}
                </div>
              );
            }}
          </form.Field>
        </div>

        <form.Field name="bio">
          {(field) => {
            const err = getFieldError(field.state.meta.errors);
            return (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="desk-profile-bio" className="font-medium text-sm">
                  <Trans>Bio</Trans>
                  <span className="ms-1.5 font-normal text-muted-foreground text-xs">
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
                {fieldError(err)}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="location">
          {(field) => {
            const err = getFieldError(field.state.meta.errors);
            return (
              <form.Subscribe selector={(state) => state.submissionAttempts}>
                {(submissionAttempts) => (
                  <div className="grid gap-2">
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
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => field.handleChange(undefined)}
                        >
                          <Trans>Clear location</Trans>
                        </Button>
                      </div>
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
                {fieldError(err)}
              </div>
            );
          }}
        </form.Field>

        <ProfilePrivacyNotice />
      </form>
    </>
  );
}

const FORM_ID = "desk-profile-form";

/**
 * The phone's username row, laid out as a settings row: label, the name, and
 * the action. Its sheet, form and copy button are unchanged.
 */
function UsernameRow({ profile }: { profile: ProfileResult }) {
  const hasUsername = Boolean(profile.username);
  return (
    <div className="relative">
      <div
        className={cn(
          "[&>section>div>:first-child]:grid [&>section>div>:first-child]:h-auto",
          "[&>section>div>:first-child]:min-h-14 [&>section>div>:first-child]:gap-4",
          "[&>section>div>:first-child]:grid-cols-[220px_minmax(0,1fr)_auto]",
          "[&>section>div>:first-child]:ps-4 [&>section>div>:first-child]:pe-2.5",
          "[&>section>div>:first-child]:hover:bg-muted/50",
          "[&>section>div>:first-child>span:first-child]:hidden",
          "[&>section>div>:first-child>span:nth-child(2)]:font-semibold",
          "[&>section>div>:first-child>span:nth-child(3)]:max-w-none",
          "[&>section>div>:first-child>span:nth-child(3)]:text-foreground",
          "[&>section>div>:first-child>span[aria-hidden=true]]:hidden",
        )}
      >
        <ProfileUsernameSection profile={profile} />
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 flex items-center px-3 text-xs font-medium",
          hasUsername ? "end-14" : "end-2.5",
        )}
      >
        {hasUsername ? <Trans>Change username</Trans> : <Trans>Choose username</Trans>}
      </span>
    </div>
  );
}
