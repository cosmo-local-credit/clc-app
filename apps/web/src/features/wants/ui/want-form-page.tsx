import { Trans, useLingui } from "@lingui/react/macro";
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
import { isStorageConfigured } from "#/lib/api/storage";
import { cn } from "#/lib/utils";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";
import type { Want } from "@clc/core/features/wants/logic";
import { useWantForm, useWantFormSources, type WantFormProfile } from "../hooks/use-want-form";

export function WantFormPage({ id }: { id?: string }) {
  const { t } = useLingui();
  const { ownerQuery, profile, usage, loading, failed, retry } = useWantFormSources(id);

  return (
    <main className="min-h-[100svh] space-y-5 bg-background px-4 pb-12 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />
      <h1>{id ? <Trans>Edit Want</Trans> : <Trans>Create Want</Trans>}</h1>
      {loading ? (
        <p className="border border-border bg-card p-4 text-sm">
          <Trans>Loading Want…</Trans>
        </p>
      ) : failed ? (
        <div className="space-y-3 border border-border bg-card p-4" role="alert">
          <p className="text-sm">
            <Trans>Couldn't load the Want form.</Trans>
          </p>
          <Button variant="outline" tap onClick={retry}>
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

function WantForm({ want, profile }: { want?: Want; profile: WantFormProfile }) {
  const { t } = useLingui();
  const {
    tagOptions,
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
  } = useWantForm({ want, profile });

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
          items={tagOptions}
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
          <Trans>
            The contact details you select are visible to signed-in users. The Want's map pin and
            exact coordinates stay public.
          </Trans>
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
          onClick={() => runLifecycle("close")}
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
          onClick={() => runLifecycle("delete")}
        >
          <Trans>Delete Want</Trans>
        </Button>
      ) : null}
    </form>
  );
}
