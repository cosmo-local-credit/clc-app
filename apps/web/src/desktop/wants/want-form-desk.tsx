import type { Want } from "@clc/core/features/wants/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { PublicLocationWarning } from "#/components/public-location-warning";
import { ResourceUsage } from "#/components/resource-usage";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Field } from "#/components/ui/field";
import { ImageUploadField } from "#/components/ui/image-upload-field";
import { Input } from "#/components/ui/input";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { LocationPicker } from "#/components/ui/location-picker";
import { TagCombobox } from "#/components/ui/tag-combobox";
import { Textarea } from "#/components/ui/textarea";
import { MarkerStylePicker } from "#/components/vouchers/marker-style-picker";
import { WantPicture } from "#/components/wants/want-row";
import { DeskCanvas, DeskEyebrow, DeskTitle } from "#/desktop/ui/page";
import {
  useWantForm,
  useWantFormSources,
  type WantFormProfile,
} from "#/features/wants/hooks/use-want-form";
import { isStorageConfigured } from "#/lib/api/storage";
import { cn } from "#/lib/utils";

/** The outline: each entry scrolls its part of the form into view. */
const OUTLINE: { target: string; label: ReactNode }[] = [
  { target: "want-part-want", label: <Trans>Want</Trans> },
  { target: "want-part-when", label: <Trans>When</Trans> },
  { target: "want-part-where", label: <Trans>Where</Trans> },
  { target: "want-part-picture", label: <Trans>Picture</Trans> },
  { target: "want-part-contact", label: <Trans>Contact</Trans> },
];
const OUTLINE_TARGETS = OUTLINE.map((entry) => entry.target);

/**
 * Create Want and Edit Want: an outline, the form, and a live preview of the
 * map pin and the Wants row.
 */
export function WantFormDesk({ wantId }: { wantId?: string }) {
  const { ownerQuery, profile, usage, loading, failed, retry } = useWantFormSources(wantId);
  const title = wantId ? <Trans>Edit Want</Trans> : <Trans>Create Want</Trans>;
  const ready = profile.data && (wantId ? true : usage.data?.wants.canCreate);

  if (ready && profile.data) {
    return <WantEditor want={wantId ? ownerQuery.data : undefined} profile={profile.data} />;
  }
  return (
    <DeskCanvas className="grid-cols-[200px_minmax(0,520px)] gap-x-8">
      <div aria-hidden="true" />
      <div className="grid min-w-0 content-start gap-5">
        <DeskTitle>{title}</DeskTitle>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            <Trans>Loading Want…</Trans>
          </p>
        ) : failed ? (
          <div className="space-y-3 border border-border bg-card p-4" role="alert">
            <p className="text-sm">
              <Trans>Couldn't load the Want form.</Trans>
            </p>
            <Button variant="outline" onClick={retry}>
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : profile.data && !wantId ? (
          <ResourceUsage resource="wants" count={false} />
        ) : null}
      </div>
    </DeskCanvas>
  );
}

function WantEditor({ want, profile }: { want?: Want; profile: WantFormProfile }) {
  const { t } = useLingui();
  const form = useWantForm({ want, profile });
  const active = useActiveTarget(OUTLINE_TARGETS);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = form.save.isPending;

  return (
    <DeskCanvas className="max-w-[1180px] grid-cols-[200px_minmax(0,520px)_minmax(240px,1fr)] items-start gap-x-8">
      <nav aria-label={t`Sections`} className="sticky top-7 grid content-start">
        {OUTLINE.map((entry) => (
          <a
            key={entry.target}
            href={`#${entry.target}`}
            aria-current={active === entry.target ? "location" : undefined}
            onClick={(event) => {
              const part = document.getElementById(entry.target);
              if (!part) return;
              event.preventDefault();
              part.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
            className={cn(
              "border-s-2 px-3 py-2 text-sm font-medium",
              active === entry.target
                ? "border-primary bg-card font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </a>
        ))}
      </nav>

      <form
        className="grid min-w-0 content-start gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        <DeskTitle>{want ? <Trans>Edit Want</Trans> : <Trans>Create Want</Trans>}</DeskTitle>

        <div id="want-part-want" className="grid scroll-mt-7 gap-5">
          <Field label={t`Name`} htmlFor="want-name">
            <Input
              id="want-name"
              className="bg-card"
              maxLength={120}
              value={form.name}
              onChange={(event) => form.setName(event.target.value)}
            />
          </Field>
          <Field label={t`Description`} htmlFor="want-description">
            <Textarea
              id="want-description"
              className="min-h-24 bg-card"
              maxLength={2000}
              value={form.description}
              onChange={(event) => form.setDescription(event.target.value)}
            />
          </Field>
          <div>
            <div className="mb-1.5 flex items-baseline gap-2">
              <label htmlFor="want-tags" className="text-sm font-medium">
                <Trans>Tags</Trans>
              </label>
              <span className="text-xs text-muted-foreground">
                <Trans>{form.tags.length} of 12 selected</Trans>
              </span>
            </div>
            <TagCombobox
              items={form.tagOptions}
              value={form.tags}
              onValueChange={(next) => form.setTags(next.slice(0, 12))}
              searchLabel={t`Search or add tags`}
              selectedLabel={t`Selected tags`}
              listLabel={t`Available tags`}
              placeholder={t`Add tags`}
              removeLabel={(tag) => t`Remove ${tag}`}
            />
          </div>
        </div>

        <div id="want-part-when" className="grid scroll-mt-7 gap-3">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t`Starts`} htmlFor="want-start">
              <Input
                id="want-start"
                type="datetime-local"
                className="bg-card font-mono"
                value={form.start}
                onChange={(event) => form.setStart(event.target.value)}
              />
            </Field>
            <Field label={t`Ends`} htmlFor="want-end">
              <Input
                id="want-end"
                type="datetime-local"
                className="bg-card font-mono"
                disabled={!form.hasEnding}
                value={form.hasEnding ? form.ending : ""}
                onChange={(event) => form.setEnding(event.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={!form.hasEnding}
              onCheckedChange={(checked) => form.setHasEnding(!checked)}
            />
            <Trans>No ending date</Trans>
          </label>
        </div>

        <div id="want-part-where" className="grid scroll-mt-7 gap-4">
          <LocationPicker
            value={form.location}
            onChange={form.setLocation}
            required
            markerStyle={{ icon: form.markerIcon, color: form.markerColor }}
          />
          <PublicLocationWarning />
          <MarkerStylePicker
            mode="want"
            value={form.markerIcon}
            onChange={form.setMarkerIcon}
            disabled={busy}
          />
        </div>

        <div id="want-part-picture" className="grid scroll-mt-7 gap-3">
          <ImageUploadField
            label={t`Want picture`}
            hint={t`Leave empty to show the Want marker.`}
            purpose="want.image"
            value={form.imageUrl}
            onChange={form.setImageUrl}
            onBusyChange={form.setImageBusy}
            disabled={!isStorageConfigured || busy}
          />
          {profile.avatarUrl ? (
            <div className="flex items-center gap-3">
              {form.imageUrl !== profile.avatarUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => form.setImageUrl(profile.avatarUrl ?? null)}
                >
                  <Trans>Use profile image</Trans>
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">
                <Trans>
                  This copies your current profile image. Later profile changes won't update this
                  Want.
                </Trans>
              </p>
            </div>
          ) : null}
        </div>

        <div id="want-part-contact" className="grid scroll-mt-7 gap-2">
          <label htmlFor="want-contact" className="text-sm font-medium">
            <Trans>How should people contact you?</Trans>
          </label>
          <Textarea
            id="want-contact"
            aria-label={t`Contact instructions`}
            className="min-h-16 bg-card"
            maxLength={500}
            value={form.contactText}
            onChange={(event) => form.setContactText(event.target.value)}
          />
          <label
            className={cn(
              "mt-1 flex items-center gap-3 text-sm",
              !form.emailAvailable && "opacity-60",
            )}
          >
            <Checkbox
              disabled={!form.emailAvailable}
              checked={form.shareEmail}
              onCheckedChange={(checked) => form.setShareEmail(checked === true)}
            />
            {form.emailAvailable ? <Trans>Share my email</Trans> : <Trans>Email unavailable</Trans>}
          </label>
          <label
            className={cn("flex items-center gap-3 text-sm", !form.phoneAvailable && "opacity-60")}
          >
            <Checkbox
              disabled={!form.phoneAvailable}
              checked={form.sharePhone}
              onCheckedChange={(checked) => form.setSharePhone(checked === true)}
            />
            {form.phoneAvailable ? (
              <Trans>Share my phone number</Trans>
            ) : (
              <Trans>Phone unavailable</Trans>
            )}
          </label>
          <p className="text-xs text-warning-foreground">
            <Trans>
              The contact details you select are visible to signed-in users. The Want's map pin and
              exact coordinates stay public.
            </Trans>
          </p>
        </div>

        {form.error ? (
          <p role="alert" className="text-sm text-destructive">
            {form.error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 border-border border-t pt-4">
          {want?.status === "OPEN" ? (
            <Button
              type="button"
              variant="outline"
              pending={form.lifecycle.isPending && form.lifecycle.variables === "close"}
              disabled={form.lifecycle.isPending}
              onClick={() => form.runLifecycle("close")}
            >
              <Trans>Close Want</Trans>
            </Button>
          ) : null}
          {want ? (
            <Button
              type="button"
              variant="destructive"
              pending={form.lifecycle.isPending && form.lifecycle.variables === "delete"}
              disabled={form.lifecycle.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trans>Delete Want</Trans>
            </Button>
          ) : null}
          <Button
            type="submit"
            className="ms-auto"
            pending={busy || form.imageBusy}
            disabled={form.imageBusy}
          >
            {want?.status === "CLOSED" ? (
              <Trans>Save and reopen Want</Trans>
            ) : want ? (
              <Trans>Save Want</Trans>
            ) : (
              <Trans>Create Want</Trans>
            )}
          </Button>
        </div>
      </form>

      <WantPreview
        name={form.name}
        location={form.location}
        markerStyle={{ icon: form.markerIcon, color: form.markerColor }}
        imageUrl={form.imageUrl}
        scheduled={new Date(form.start).getTime() > Date.now()}
      />

      <DialogRoot open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="rounded-none border border-border bg-card shadow-none">
            <DialogTitle>
              <Trans>Delete this Want?</Trans>
            </DialogTitle>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setConfirmDelete(false);
                  form.runLifecycle("delete");
                }}
              >
                <Trans>Delete Want</Trans>
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </DeskCanvas>
  );
}

function WantPreview({
  name,
  location,
  markerStyle,
  imageUrl,
  scheduled,
}: {
  name: string;
  location: { lat: number; lng: number; locationName: string } | undefined;
  markerStyle: { icon: Want["markerIcon"]; color: Want["markerColor"] };
  imageUrl: string | null;
  scheduled: boolean;
}) {
  const { t } = useLingui();
  const shownName = name.trim() || t`Want`;
  return (
    <aside className="sticky top-7 grid min-w-0 content-start gap-2.5">
      <DeskEyebrow>
        <Trans>Preview · Map</Trans>
      </DeskEyebrow>
      {location ? (
        <Suspense fallback={<div className="h-[180px] border border-border bg-card" />}>
          <LocationMap
            key={`${location.lat},${location.lng}`}
            lat={location.lat}
            lng={location.lng}
            markerStyle={markerStyle}
            className="h-[180px]"
          />
        </Suspense>
      ) : (
        <div className="h-[180px] border border-border bg-card" />
      )}
      <DeskEyebrow className="mt-3">
        <Trans>Preview · Wants</Trans>
      </DeskEyebrow>
      <div className="flex min-h-14 min-w-0 items-center gap-3 border border-border bg-card px-3.5 py-2.5">
        <WantPicture
          want={{ imageUrl, markerIcon: markerStyle.icon, markerColor: markerStyle.color }}
          size="size-[34px]"
        />
        <div className="min-w-0 flex-1">
          <div dir="auto" className="truncate text-sm font-semibold">
            {shownName}
          </div>
          {location ? (
            <div dir="auto" className="truncate text-xs text-muted-foreground">
              {location.locationName}
            </div>
          ) : null}
        </div>
        {scheduled ? (
          <Badge variant="outline" size="sm" className="text-want-ink">
            <Trans>Scheduled</Trans>
          </Badge>
        ) : null}
      </div>
    </aside>
  );
}

/** The last outline entry whose part has scrolled into the top part of the viewport. */
function useActiveTarget(targets: readonly string[]) {
  const [active, setActive] = useState(targets[0]);
  useEffect(() => {
    let frame = 0;
    const update = (event?: Event) => {
      const scroller = event?.target instanceof Element ? event.target : null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // At the end of the page the last part may never reach the line.
        const atEnd =
          scroller !== null &&
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        const line = atEnd ? window.innerHeight : window.innerHeight * 0.4;
        let current = targets[0];
        for (const target of targets) {
          const element = document.getElementById(target);
          if (element && element.getBoundingClientRect().top <= line) current = target;
        }
        setActive(current);
      });
    };
    update();
    // The canvas scrolls, not the window; capture sees every scroller.
    document.addEventListener("scroll", update, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", update, { capture: true });
    };
  }, [targets]);
  return active;
}
