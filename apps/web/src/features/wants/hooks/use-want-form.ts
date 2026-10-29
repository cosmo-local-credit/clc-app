import { BackendApiError } from "@clc/api/client/errors";
import {
  myWantQueryOptions,
  saveWantMutationOptions,
  wantKeys,
} from "@clc/api/features/wants/queries";
import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { resourceLimitKeys } from "@clc/api/features/resource-limits/queries";
import type { LocationInput } from "@clc/core/features/location/logic";
import type { MarkerColor } from "@clc/core/features/markers/logic";
import {
  defaultWantStartsAt,
  type Want,
  type WantMarkerIcon,
  wantWriteSchema,
} from "@clc/core/features/wants/logic";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { tokenTagsQueryKey, useTokenTags } from "#/hooks/use-deployment";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { wantsClient } from "#/lib/api/wants";
import { useViewDraft } from "#/lib/view-drafts";

export type WantFormProfile = NonNullable<ReturnType<typeof useAuthProfile>["data"]>;

function localDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * The fields the editor keeps across a phone/desktop view swap. The picture is
 * not one of them: an upload is a file in flight and a copied profile image is a
 * choice the person can repeat, so a swap leaves the Want's saved picture alone.
 */
type WantDraft = {
  name: string;
  description: string;
  tags: string[];
  start: string;
  hasEnding: boolean;
  ending: string;
  location: LocationInput | undefined;
  contactText: string;
  shareEmail: boolean;
  sharePhone: boolean;
  markerIcon: WantMarkerIcon;
};

/** What the Want editor loads before it can show the form: the profile, the Want, the allowance. */
export function useWantFormSources(id?: string) {
  const auth = useAuthStatus();
  const ownerQuery = useQuery({
    ...myWantQueryOptions(wantsClient, auth.address ?? "", id ?? ""),
    enabled: !!id && !!auth.address,
  });
  const profile = useAuthProfile();
  const usage = useResourceUsage(!id);
  return {
    ownerQuery,
    profile,
    usage,
    loading: profile.isPending || (!!id && ownerQuery.isPending),
    failed: profile.isError || (!!id && ownerQuery.isError),
    retry: () => {
      void profile.refetch();
      void ownerQuery.refetch();
    },
  };
}

/** Field state, save and the close/delete lifecycle of the Want editor. */
export function useWantForm({ want, profile }: { want?: Want; profile: WantFormProfile }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tagsQuery = useTokenTags();
  const { address: account } = useAuthStatus();
  const viewDraft = useViewDraft<WantDraft>({
    scope: want ? `want-edit:${want.id}` : "want-new",
    account,
  });
  const restored = viewDraft.restored;
  const initialLocation = useMemo<LocationInput | undefined>(() => {
    if (want)
      return {
        lat: want.geoLat,
        lng: want.geoLng,
        locationName: want.locationName,
        country: profile.country,
      };
    if (profile.geoLat == null || profile.geoLng == null || !profile.locationName) return undefined;
    return {
      lat: profile.geoLat,
      lng: profile.geoLng,
      locationName: profile.locationName,
      country: profile.country,
    };
  }, [profile, want]);
  const emailAvailable = !!profile.email && !profile.email.toLowerCase().endsWith("@clc.local");
  const phoneAvailable = !!profile.phone?.trim();
  // The editor as it opens, before anyone has typed: the draft is only kept
  // while the fields differ from this.
  const [pristine] = useState<WantDraft>(() => ({
    name: want?.name ?? "",
    description: want?.description ?? "",
    tags: want?.tags ?? [],
    start: localDateTime(want?.startsAt ?? defaultWantStartsAt()),
    hasEnding: want?.expiresAt !== null && !!want?.expiresAt,
    ending: want?.expiresAt ? localDateTime(want.expiresAt) : "",
    location: initialLocation,
    contactText: want?.contactText ?? "",
    shareEmail: !!want && ((want.contactPermission ?? 0) & 1) === 1 && emailAvailable,
    sharePhone: !!want && ((want.contactPermission ?? 0) & 2) === 2 && phoneAvailable,
    markerIcon: want?.markerIcon ?? "question",
  }));
  // A restored draft wins over the loaded Want. Contact sharing is still bound
  // by what the profile can offer now.
  const seed = restored ?? pristine;
  const [name, setName] = useState(seed.name);
  const [description, setDescription] = useState(seed.description);
  const [tags, setTags] = useState<string[]>(seed.tags);
  const [start, setStart] = useState(seed.start);
  const [hasEnding, setHasEnding] = useState(seed.hasEnding);
  const [ending, setEnding] = useState(seed.ending);
  const [location, setLocation] = useState<LocationInput | undefined>(seed.location);
  const [imageUrl, setImageUrl] = useState<string | null>(want?.imageUrl ?? null);
  const [imageBusy, setImageBusy] = useState(false);
  const [contactText, setContactText] = useState(seed.contactText);
  const [shareEmail, setShareEmail] = useState(seed.shareEmail && emailAvailable);
  const [sharePhone, setSharePhone] = useState(seed.sharePhone && phoneAvailable);
  const [markerIcon, setMarkerIcon] = useState<WantMarkerIcon>(seed.markerIcon);
  const { save: saveDraft, clear: clearDraft } = viewDraft;
  useEffect(() => {
    const current: WantDraft = {
      name,
      description,
      tags,
      start,
      hasEnding,
      ending,
      location,
      contactText,
      shareEmail,
      sharePhone,
      markerIcon,
    };
    if (JSON.stringify(current) === JSON.stringify(pristine)) clearDraft();
    else saveDraft(current);
  }, [
    clearDraft,
    contactText,
    description,
    ending,
    hasEnding,
    location,
    markerIcon,
    name,
    pristine,
    saveDraft,
    shareEmail,
    sharePhone,
    start,
    tags,
  ]);
  const markerColor: MarkerColor = want?.markerColor ?? "orange";
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(
    saveWantMutationOptions(wantsClient, queryClient, want?.id, want?.status === "CLOSED"),
  );
  const lifecycle = useMutation({
    mutationFn: (action: "close" | "delete") =>
      action === "close" ? wantsClient.close(want?.id ?? "") : wantsClient.remove(want?.id ?? ""),
    onSuccess: async () => {
      clearDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.all }),
        queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
      ]);
      await navigate({ to: "/", search: { tab: "wallet" }, replace: true });
    },
    onError: () => setError(t`Couldn't save this Want. Try again.`),
  });

  const submit = async () => {
    setError(null);
    if (!location) {
      setError(t`Choose a location.`);
      return;
    }
    const startDate = new Date(start);
    const endDate = hasEnding && ending ? new Date(ending) : null;
    const input = {
      name,
      description,
      tags,
      startsAt: Number.isNaN(startDate.getTime()) ? "" : startDate.toISOString(),
      expiresAt:
        endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : hasEnding ? "" : null,
      location,
      imageUrl,
      contactText: contactText.trim() || null,
      shareEmail,
      sharePhone,
      markerIcon,
      markerColor,
    };
    const parsed = wantWriteSchema.safeParse(input);
    if (!parsed.success) {
      setError(t`Check the Want details.`);
      return;
    }
    try {
      const saved = await save.mutateAsync(parsed.data);
      clearDraft();
      await queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey });
      if (saved.state === "active") {
        await navigate({
          to: "/wants/$wantId",
          params: { wantId: saved.id },
          search: { from: "wallet" },
          replace: true,
        });
      } else {
        await navigate({
          to: "/wallet/wants/$wantId/edit",
          params: { wantId: saved.id },
          replace: true,
        });
      }
    } catch (cause) {
      setError(
        cause instanceof BackendApiError && cause.code === "E11"
          ? t`Want limit reached. Ask an administrator to increase your allowance.`
          : t`Couldn't save this Want. Try again.`,
      );
    }
  };

  const runLifecycle = (action: "close" | "delete") => {
    setError(null);
    lifecycle.mutate(action);
  };

  return {
    tagOptions: tagsQuery.data ?? [],
    name,
    setName,
    description,
    setDescription,
    tags,
    setTags,
    start,
    setStart,
    hasEnding,
    setHasEnding,
    ending,
    setEnding,
    location,
    setLocation,
    imageUrl,
    setImageUrl,
    imageBusy,
    setImageBusy,
    contactText,
    setContactText,
    emailAvailable,
    phoneAvailable,
    shareEmail,
    setShareEmail,
    sharePhone,
    setSharePhone,
    markerIcon,
    setMarkerIcon,
    markerColor,
    error,
    save,
    lifecycle,
    submit,
    runLifecycle,
  };
}
