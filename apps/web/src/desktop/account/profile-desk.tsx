import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import type { ProfileResult } from "@clc/api/features/auth/client";
import type { LocationInput } from "@clc/core/features/location/logic";
import { locationSchema } from "@clc/core/features/location/logic";
import { type ProfileEditInput, profileEditSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";

import { ProfilePrivacyNotice } from "#/components/profile-privacy-notice";
import { UsernameInput } from "#/components/profile/username-input";
import { Button } from "#/components/ui/button";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { DeskPhoneField } from "#/desktop/ui/phone-field";
import { Textarea } from "#/components/ui/textarea";
import { UnitOfAccountCombobox } from "#/components/ui/unit-of-account-combobox";
import { DeskCanvas, DeskTitle, DeskTitleRow } from "#/desktop/ui/page";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useUpdateProfile } from "#/features/auth/hooks/use-update-profile";
import { useCopyUsername, useUsernameForm } from "#/features/auth/hooks/use-username-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { preferredCurrencyForCountry } from "#/lib/profile-currency";
import { translateRecipientError } from "#/lib/recipient-error-i18n";
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
                  <DeskPhoneField
                    id="desk-profile-phone"
                    defaultCountry={profile.country}
                    value={field.state.value}
                    onChange={(val) => field.handleChange(val)}
                    invalid={!!err}
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
 * The username as a settings row — label, name, action — with the editor in a
 * popover anchored to its action, and copy beside it.
 */
function UsernameRow({ profile }: { profile: ProfileResult }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const copy = useCopyUsername();
  const username = profile.username ?? null;

  return (
    <section
      aria-label={t`Username`}
      className="grid min-h-14 grid-cols-[220px_minmax(0,1fr)_auto] items-center gap-4 border border-border bg-card ps-4 pe-2.5"
    >
      <span className="text-sm font-semibold">
        <Trans>Username</Trans>
      </span>
      <span className="min-w-0 truncate text-xs">
        {username ? (
          <bdi dir="auto" className="font-mono">
            {username}
          </bdi>
        ) : (
          <span className="text-muted-foreground">{t`Not set`}</span>
        )}
      </span>
      <span className="flex items-center gap-1">
        <PopoverRoot open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button variant="ghost" />}>
            {username ? <Trans>Change username</Trans> : <Trans>Choose username</Trans>}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            {/* Mounted only while open so each visit starts from the saved name. */}
            {open ? <UsernameForm profile={profile} onClose={() => setOpen(false)} /> : null}
          </PopoverContent>
        </PopoverRoot>
        {username ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t`Copy wallet username`}
            onClick={() => copy(username)}
          >
            <RiFileCopyLine aria-hidden="true" />
          </Button>
        ) : null}
      </span>
    </section>
  );
}

function UsernameForm({ profile, onClose }: { profile: ProfileResult; onClose: () => void }) {
  const { i18n, t } = useLingui();
  const { form, current, submitError, clearSubmitError, saving } = useUsernameForm({
    profile,
    onClose,
  });

  return (
    <form
      aria-label={current ? t`Change username` : t`Choose username`}
      className="grid gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <PopoverTitle className="font-heading text-sm font-semibold">
        {current ? <Trans>Change username</Trans> : <Trans>Choose username</Trans>}
      </PopoverTitle>
      <form.Field name="username">
        {(field) => {
          const err = getFieldError(field.state.meta.errors);
          return (
            <UsernameInput
              id="desk-profile-username"
              value={field.state.value}
              hint={() => profile.name}
              onChange={(next) => {
                clearSubmitError();
                field.handleChange(next);
              }}
              onBlur={field.handleBlur}
              error={err ? translateValidationError(err, i18n) : null}
            />
          );
        }}
      </form.Field>
      {current ? (
        <p className="text-muted-foreground text-xs">
          <Trans>
            Your current username stops working as soon as you save, and someone else can then take
            it.
          </Trans>
        </p>
      ) : null}
      {submitError ? (
        <p className="text-destructive text-xs" role="alert">
          {submitError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
            username: state.values.username,
          })}
        >
          {({ canSubmit, isSubmitting, username }) => {
            const normalized = username.trim().normalize("NFC");
            return (
              <Button
                type="submit"
                disabled={!canSubmit || normalized === "" || normalized === current}
                pending={isSubmitting}
              >
                {isSubmitting ? t`Saving…` : t`Save username`}
              </Button>
            );
          }}
        </form.Subscribe>
      </div>
    </form>
  );
}
