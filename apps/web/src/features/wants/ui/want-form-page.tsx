import { BackendApiError } from "@clc/api/client/errors";
import {
  myWantQueryOptions,
  saveWantMutationOptions,
  wantKeys,
} from "@clc/api/features/wants/queries";
import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { resourceLimitKeys } from "@clc/api/features/resource-limits/queries";
import type { LocationInput } from "@clc/core/features/location/logic";
import {
  defaultWantStartsAt,
  type Want,
  type WantMarkerIcon,
  wantWriteSchema,
} from "@clc/core/features/wants/logic";
import type { MarkerColor } from "@clc/core/features/markers/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationPicker } from "#/components/ui/location-picker";
import { PublicLocationWarning } from "#/components/public-location-warning";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { BackChevron } from "#/components/wallet";
import { ResourceUsage } from "#/components/resource-usage";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { tokenTagsQueryKey, useTokenTags } from "#/hooks/use-deployment";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { wantsClient } from "#/lib/api/wants";
import { isStorageConfigured } from "#/lib/api/storage";
import { cn } from "#/lib/utils";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";

function localDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function WantFormPage({ id }: { id?: string }) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const ownerQuery = useQuery({
    ...myWantQueryOptions(wantsClient, auth.address ?? "", id ?? ""),
    enabled: !!id && !!auth.address,
  });
  const profile = useAuthProfile();
  const usage = useResourceUsage(!id);

  return (
    <main className="min-h-[100svh] space-y-5 bg-background px-4 pb-12 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />
      <h1>{id ? <Trans>Edit Want</Trans> : <Trans>Create Want</Trans>}</h1>
      {profile.isPending || (id && ownerQuery.isPending) ? (
        <p className="border border-border bg-card p-4 text-sm">
          <Trans>Loading Want…</Trans>
        </p>
      ) : profile.isError || (id && ownerQuery.isError) ? (
        <div className="space-y-3 border border-border bg-card p-4" role="alert">
          <p className="text-sm">
            <Trans>Couldn't load the Want form.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            onClick={() => {
              void profile.refetch();
              void ownerQuery.refetch();
            }}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : profile.data ? (
        id ? (
          <WantForm want={ownerQuery.data} profile={profile.data} />
        ) : (
          <>
            <ResourceUsage resource="wants" count={false} />
            {usage.data?.wants.canCreate ? <WantForm profile={profile.data} /> : null}
          </>
        )
      ) : null}
    </main>
  );
}

function WantForm({
  want,
  profile,
}: {
  want?: Want;
  profile: NonNullable<ReturnType<typeof useAuthProfile>["data"]>;
}) {
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

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t`Name`} htmlFor="want-name">
        <Input
          id="want-name"
          className="bg-card"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label={t`Description`} htmlFor="want-description">
        <Textarea
          id="want-description"
          className="min-h-32 bg-card"
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field label={t`Tags`} htmlFor="want-tags" hint={t`${tags.length} of 12 selected`}>
        <TagCombobox
          items={tagsQuery.data ?? []}
          value={tags}
          onValueChange={(next) => setTags(next.slice(0, 12))}
          searchLabel={t`Search or add tags`}
          selectedLabel={t`Selected tags`}
          listLabel={t`Available tags`}
          placeholder={t`Add tags`}
          removeLabel={(tag) => t`Remove ${tag}`}
        />
      </Field>
      <Field label={t`Starts`} htmlFor="want-start">
        <Input
          id="want-start"
          type="datetime-local"
          className="bg-card font-mono"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Checkbox checked={!hasEnding} onCheckedChange={(checked) => setHasEnding(!checked)} />
        <Trans>No ending date</Trans>
      </label>
      {hasEnding ? (
        <Field label={t`Ends`} htmlFor="want-end">
          <Input
            id="want-end"
            type="datetime-local"
            className="bg-card font-mono"
            value={ending}
            onChange={(event) => setEnding(event.target.value)}
          />
        </Field>
      ) : null}
      <LocationPicker
        value={location}
        onChange={setLocation}
        required
        markerStyle={{ icon: markerIcon, color: markerColor }}
      />
      <PublicLocationWarning />
      <MarkerStylePicker
        mode="want"
        value={markerIcon}
        onChange={setMarkerIcon}
        disabled={save.isPending}
      />
      <ImageUploadField
        label={t`Want picture`}
        hint={t`Leave empty to show the Want marker.`}
        purpose="want.image"
        value={imageUrl}
        onChange={setImageUrl}
        onBusyChange={setImageBusy}
        disabled={!isStorageConfigured || save.isPending}
      />
      {profile.avatarUrl && imageUrl !== profile.avatarUrl ? (
        <Button
          type="button"
          variant="outline"
          tap
          onClick={() => setImageUrl(profile.avatarUrl ?? null)}
        >
          <Trans>Use profile image</Trans>
        </Button>
      ) : null}
      {profile.avatarUrl ? (
        <p className="text-xs text-muted-foreground">
          <Trans>
            This copies your current profile image. Later profile changes won't update this Want.
          </Trans>
        </p>
      ) : null}
      <section className="space-y-3 border border-border bg-card p-4">
        <h2>
          <Trans>How should people contact you?</Trans>
        </h2>
        <p className="text-xs text-warning-foreground">
          <Trans>The contact details you select will be public on this Want.</Trans>
        </p>
        <Field label={t`Contact instructions`} htmlFor="want-contact">
          <Textarea
            id="want-contact"
            className="min-h-24 bg-card"
            maxLength={500}
            value={contactText}
            onChange={(event) => setContactText(event.target.value)}
          />
        </Field>
        <label
          className={cn(
            "flex min-h-11 items-center gap-3 text-sm",
            !emailAvailable && "opacity-60",
          )}
        >
          <Checkbox
            disabled={!emailAvailable}
            checked={shareEmail}
            onCheckedChange={(checked) => setShareEmail(checked === true)}
          />
          {emailAvailable ? <Trans>Share my email</Trans> : <Trans>Email unavailable</Trans>}
        </label>
        <label
          className={cn(
            "flex min-h-11 items-center gap-3 text-sm",
            !phoneAvailable && "opacity-60",
          )}
        >
          <Checkbox
            disabled={!phoneAvailable}
            checked={sharePhone}
            onCheckedChange={(checked) => setSharePhone(checked === true)}
          />
          {phoneAvailable ? <Trans>Share my phone number</Trans> : <Trans>Phone unavailable</Trans>}
        </label>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        tap
        className="w-full"
        pending={save.isPending || imageBusy}
        disabled={imageBusy}
      >
        {want?.status === "CLOSED" ? (
          <Trans>Save and reopen Want</Trans>
        ) : want ? (
          <Trans>Save Want</Trans>
        ) : (
          <Trans>Create Want</Trans>
        )}
      </Button>
      {want?.status === "OPEN" ? (
        <Button
          type="button"
          variant="outline"
          tap
          className="w-full"
          pending={lifecycle.isPending}
          onClick={() => {
            setError(null);
            lifecycle.mutate("close");
          }}
        >
          <Trans>Close Want</Trans>
        </Button>
      ) : null}
      {want ? (
        <Button
          type="button"
          variant="destructive"
          tap
          className="w-full"
          pending={lifecycle.isPending}
          onClick={() => {
            setError(null);
            lifecycle.mutate("delete");
          }}
        >
          <Trans>Delete Want</Trans>
        </Button>
      ) : null}
    </form>
  );
}
