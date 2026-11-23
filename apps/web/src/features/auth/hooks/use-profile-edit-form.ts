import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import type { ProfileResult } from "@clc/api/features/auth/client";
import { type LocationInput, locationSchema } from "@clc/core/features/location/logic";
import {
  DEFAULT_PROFILE_VISIBILITY,
  profileVisibilitySchema,
} from "@clc/core/features/public-profiles/logic";
import { type ProfileEditInput, profileEditSchema } from "@clc/core/features/signup/logic";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useIsMutating } from "@tanstack/react-query";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  updateProfileMutationKey,
  useUpdateProfile,
} from "#/features/auth/hooks/use-update-profile";
import { preferredCurrencyForCountry } from "#/lib/profile-currency";
import { translateRecipientError } from "#/lib/recipient-error-i18n";
import { useViewDraft } from "#/lib/view-drafts";

// The signup flow stores a placeholder email for wallets created without one.
// Treat it as empty so the edit form starts blank rather than exposing it.
const PLACEHOLDER_EMAIL_SUFFIX = "@clc.local";

/**
 * Edit profile's form and save, shared by the phone page and the desktop view:
 * the contact fields, the photo held beside them, and the error a failed save
 * leaves. The photo is outside the form for the same reason the picker is: it
 * uploads on selection, so by submit time it is a URL with nothing to validate.
 *
 * TanStack Form takes `defaultValues` once, so mount this only once the profile
 * has been read.
 */
export function useProfileEditForm(profile: ProfileResult) {
  const { i18n, t } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  // A save outlives the view that started it: after a phone/desktop swap the
  // other view's press would write the profile a second time.
  const inFlight = useIsMutating({ mutationKey: updateProfileMutationKey }) > 0;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const storedAvatarUrl = profile.avatarUrl ?? null;
  const viewDraft = useViewDraft<{ fields: ProfileEditInput; avatarUrl: string | null }>({
    scope: "profile-edit",
    account: profile.address,
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    viewDraft.restored ? viewDraft.restored.avatarUrl : storedAvatarUrl,
  );
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
    publicProfile: profile.publicProfile ?? { ...DEFAULT_PROFILE_VISIBILITY },
    name: profile.name ?? "",
    email: profile.email.endsWith(PLACEHOLDER_EMAIL_SUFFIX) ? "" : (profile.email ?? ""),
    phone: profile.phone ?? "",
    location: initialLocation,
    // Accounts made before profile preferences existed still get a useful,
    // editable starting point the first time their profile is opened.
    preferredCurrency:
      profile.preferredCurrency?.trim() || preferredCurrencyForCountry(profile.country),
    bio: profile.bio ?? "",
    website: profile.website ?? "",
  };

  const [opened] = useState(() => ({
    signature: JSON.stringify({ fields: defaultValues, avatarUrl: storedAvatarUrl }),
    publicProfile: defaultValues.publicProfile,
  }));
  const restoredChanges =
    !!viewDraft.restored && JSON.stringify(viewDraft.restored) !== opened.signature;
  const visibilityChanged = (value: ProfileEditInput) =>
    JSON.stringify(value.publicProfile) !== JSON.stringify(opened.publicProfile);
  const isVisibilityOnly = (value: ProfileEditInput) =>
    visibilityChanged(value) &&
    JSON.stringify({ fields: { ...value, publicProfile: opened.publicProfile }, avatarUrl }) ===
      opened.signature;
  const form = useForm({
    defaultValues: viewDraft.restored?.fields ?? defaultValues,
    validators: {
      onChange: ({ value, formApi }) =>
        isVisibilityOnly(value) && profileVisibilitySchema.safeParse(value.publicProfile).success
          ? undefined
          : formApi.parseValuesWithSchema(profileEditSchema),
    },
    onSubmit: async ({ value }) => {
      if (inFlight) return;
      setSubmitError(null);
      try {
        if (isVisibilityOnly(value)) {
          await updateProfile.mutateAsync({
            visibilityOnly: true,
            publicProfile: profileVisibilitySchema.parse(value.publicProfile),
          });
        } else {
          const parsed = profileEditSchema.parse(value);
          await updateProfile.mutateAsync({
            ...(visibilityChanged(value) ? { publicProfile: parsed.publicProfile } : {}),
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
            // Sent only when it moved: an omitted key preserves whatever is
            // stored, so a save that never touched the photo cannot disturb it.
            // null is what the client turns into clc-core's clearAvatar flag.
            ...(avatarUrl !== storedAvatarUrl ? { avatarUrl } : {}),
          });
        }
        viewDraft.clear();
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

  const { save: saveViewDraft, clear: clearViewDraft } = viewDraft;
  useEffect(() => {
    let seen: unknown;
    const sync = () => {
      const fields = form.store.state.values;
      if (seen === fields) return;
      seen = fields;
      const current = { fields, avatarUrl };
      if (JSON.stringify(current) === opened.signature) clearViewDraft();
      else saveViewDraft(current);
    };
    sync();
    const subscription = form.store.subscribe(sync);
    return () => subscription.unsubscribe();
  }, [form, avatarUrl, opened, clearViewDraft, saveViewDraft]);

  return {
    form,
    restoredChanges,
    avatarUrl,
    setAvatarUrl,
    /** A new or removed photo is a change on its own, with every field untouched. */
    avatarChanged: avatarUrl !== storedAvatarUrl,
    avatarBusy,
    setAvatarBusy,
    submitError,
    /** A save is in flight, from this view or the one it replaced. */
    inFlight,
  };
}
