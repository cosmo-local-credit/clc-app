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
import { useMemo, useState } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { tokenTagsQueryKey, useTokenTags } from "#/hooks/use-deployment";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { wantsClient } from "#/lib/api/wants";

export type WantFormProfile = NonNullable<ReturnType<typeof useAuthProfile>["data"]>;

function localDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

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
  const [name, setName] = useState(want?.name ?? "");
  const [description, setDescription] = useState(want?.description ?? "");
  const [tags, setTags] = useState<string[]>(want?.tags ?? []);
  const [start, setStart] = useState(localDateTime(want?.startsAt ?? defaultWantStartsAt()));
  const [hasEnding, setHasEnding] = useState(want?.expiresAt !== null && !!want?.expiresAt);
  const [ending, setEnding] = useState(want?.expiresAt ? localDateTime(want.expiresAt) : "");
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
  const [location, setLocation] = useState<LocationInput | undefined>(initialLocation);
  const [imageUrl, setImageUrl] = useState<string | null>(want?.imageUrl ?? null);
  const [imageBusy, setImageBusy] = useState(false);
  const [contactText, setContactText] = useState(want?.contactText ?? "");
  const emailAvailable = !!profile.email && !profile.email.toLowerCase().endsWith("@clc.local");
  const phoneAvailable = !!profile.phone?.trim();
  const [shareEmail, setShareEmail] = useState(
    !!want && ((want.contactPermission ?? 0) & 1) === 1 && emailAvailable,
  );
  const [sharePhone, setSharePhone] = useState(
    !!want && ((want.contactPermission ?? 0) & 2) === 2 && phoneAvailable,
  );
  const [markerIcon, setMarkerIcon] = useState<WantMarkerIcon>(want?.markerIcon ?? "question");
  const markerColor: MarkerColor = want?.markerColor ?? "orange";
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(
    saveWantMutationOptions(wantsClient, queryClient, want?.id, want?.status === "CLOSED"),
  );
  const lifecycle = useMutation({
    mutationFn: (action: "close" | "delete") =>
      action === "close" ? wantsClient.close(want?.id ?? "") : wantsClient.remove(want?.id ?? ""),
    onSuccess: async () => {
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
