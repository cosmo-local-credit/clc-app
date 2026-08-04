import { type ProfileEditInput, profileEditSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { CountrySelect } from "#/components/ui/country-select";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PhoneInputField } from "#/components/ui/phone-input";
import { BackChevron } from "#/components/wallet/wallet-kit";
import {
  BackendApiError,
  formatBackendApiError,
  type ProfileResult,
} from "#/features/auth/api/client";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useUpdateProfile } from "#/features/auth/hooks/use-update-profile";
import { translateValidationError } from "#/lib/validation-i18n";

// The signup flow stores a placeholder email for wallets created without one.
// Treat it as empty so the edit form starts blank rather than exposing it.
const PLACEHOLDER_EMAIL_SUFFIX = "@clc.local";

export function ProfileEditPage() {
  const { t } = useLingui();
  const profileQuery = useAuthProfile();

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Settings`} to="/" search={{ tab: "settings" }} />

      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Edit profile</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Update your contact details and saved location pin.</Trans>
        </p>
      </div>

      {profileQuery.isPending ? (
        <ProfileEditSkeleton />
      ) : profileQuery.isError ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-muted-foreground text-sm">
            <Trans>We couldn't load your profile.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-card"
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
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const savedLocation = profile.location
    ? { ...profile.location, country: profile.country }
    : undefined;

  const defaultValues: ProfileEditInput = {
    name: profile.name ?? "",
    email: profile.email.endsWith(PLACEHOLDER_EMAIL_SUFFIX) ? "" : (profile.email ?? ""),
    phone: profile.phone ?? "",
    country: profile.country ?? "",
    saveLocation: !!savedLocation,
    location: savedLocation,
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
          country: parsed.location?.country ?? parsed.country,
          ...(parsed.saveLocation && parsed.location
            ? {
                location: {
                  locationName: parsed.location.locationName,
                  lat: parsed.location.lat,
                  lng: parsed.location.lng,
                },
              }
            : {}),
          ...(!parsed.saveLocation && profile.location ? { clearLocation: true } : {}),
        });
        toast.success(t`Profile updated`);
        if (canGoBack) {
          router.history.back();
        } else {
          void navigate({ to: "/", search: { tab: "settings" }, replace: true });
        }
      } catch (err) {
        setSubmitError(
          err instanceof BackendApiError
            ? formatBackendApiError(err)
            : err instanceof Error
              ? err.message
              : t`Couldn't save your profile.`,
        );
      }
    },
  });

  return (
    <form
      aria-label={t`Edit profile`}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-4"
    >
      <div className="space-y-4 border border-border bg-card p-4">
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
                  <p className="text-destructive text-xs">{translateValidationError(err, i18n)}</p>
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
                <label htmlFor="profile-email" className="font-medium text-sm">
                  <Trans>Email</Trans>
                </label>
                <Input
                  id="profile-email"
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
                  <p className="text-destructive text-xs">{translateValidationError(err, i18n)}</p>
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
                  value={field.state.value}
                  onChange={(val) => field.handleChange(val)}
                  aria-invalid={!!err}
                  aria-label={t`Phone number`}
                />
                {err ? (
                  <p className="text-destructive text-xs">{translateValidationError(err, i18n)}</p>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <form.Field name="country">
          {(field) => {
            const err = getFieldError(field.state.meta.errors);
            return (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-country" className="font-medium text-sm">
                  <Trans>Country</Trans>
                </label>
                <CountrySelect
                  id="profile-country"
                  value={field.state.value}
                  onChange={(val) => field.handleChange(val)}
                  aria-invalid={!!err}
                  aria-label={t`Country`}
                />
                {err ? (
                  <p className="text-destructive text-xs">{translateValidationError(err, i18n)}</p>
                ) : null}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="saveLocation">
          {(saveLocationField) => (
            <div className="space-y-3 border-t border-border pt-4">
              <label className="flex items-start gap-3" htmlFor="profile-save-location">
                <input
                  id="profile-save-location"
                  type="checkbox"
                  checked={saveLocationField.state.value}
                  onChange={(event) => saveLocationField.handleChange(event.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="block font-medium text-sm">
                    <Trans>Save a location pin</Trans>
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    <Trans>You can choose to share this pin with a recipient when sending.</Trans>
                  </span>
                </span>
              </label>

              {saveLocationField.state.value ? (
                <form.Field name="location">
                  {(locationField) => {
                    const err = getFieldError(locationField.state.meta.errors);
                    return (
                      <LocationPicker
                        value={locationField.state.value}
                        onChange={(next) => {
                          locationField.handleChange(next);
                          if (next) form.setFieldValue("country", next.country);
                        }}
                        error={err ? translateValidationError(err, i18n) : undefined}
                      />
                    );
                  }}
                </form.Field>
              ) : null}
            </div>
          )}
        </form.Field>
      </div>

      {submitError ? <p className="text-destructive text-xs">{submitError}</p> : null}

      <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting, canSubmit: s.canSubmit })}>
        {({ isSubmitting, canSubmit }) => (
          <Button type="submit" disabled={!canSubmit || isSubmitting} className="h-11 w-full">
            {isSubmitting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
            {isSubmitting ? t`Saving…` : t`Save changes`}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function ProfileEditSkeleton() {
  return (
    <div className="space-y-4 border border-border bg-card p-4">
      {["name", "email", "phone", "country", "location"].map((key) => (
        <div key={key} className="flex flex-col gap-1.5">
          <div className="h-4 w-16 bg-muted" />
          <div className="h-9 w-full bg-muted" />
        </div>
      ))}
    </div>
  );
}
