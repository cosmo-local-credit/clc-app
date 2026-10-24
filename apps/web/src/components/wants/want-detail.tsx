import type { Want } from "@clc/core/features/wants/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiMailLine, RiPhoneLine, RiShareLine } from "react-icons/ri";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { TagBadge } from "#/components/ui/tag-badge";
import { WantPicture } from "./want-row";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";

export function WantDetail({
  want,
  showHeader = true,
  distanceOrigin = null,
}: {
  want: Want;
  showHeader?: boolean;
  distanceOrigin?: { lat: number; lng: number } | null;
}) {
  const { i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const distance = useMarketDistanceLabel(distanceOrigin, { lat: want.geoLat, lng: want.geoLng });
  return (
    <div className="space-y-4">
      {showHeader ? (
        <header className="border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <WantPicture want={want} size="size-14" />
            <div className="min-w-0 flex-1">
              <h1 dir="auto" className="font-heading text-[1.75rem] font-bold leading-tight">
                {want.name}
              </h1>
              <p dir="auto" className="mt-1 text-xs text-muted-foreground">
                <Trans>Wanted by {want.ownerName}</Trans>
              </p>
            </div>
            <WantShareButton want={want} />
          </div>
        </header>
      ) : null}

      {want.tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {want.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} size="sm" />
          ))}
        </div>
      ) : null}

      <section className="space-y-2 border border-border bg-card p-4">
        <h2>
          <Trans>When and where</Trans>
        </h2>
        <p dir="auto" className="text-sm">
          {want.locationName}
          {distance ? ` · ${distance}` : null}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          <Trans>Starts {dates.format(new Date(want.startsAt))}</Trans>
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {want.expiresAt ? (
            <Trans>Ends {dates.format(new Date(want.expiresAt))}</Trans>
          ) : (
            <Trans>No ending date</Trans>
          )}
        </p>
      </section>

      <section className="space-y-2 border border-border bg-card p-4">
        <h2>
          <Trans>Description</Trans>
        </h2>
        <p dir="auto" className="whitespace-pre-wrap text-sm">
          {want.description}
        </p>
      </section>

      {want.contact ? (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2>
            <Trans>Contact</Trans>
          </h2>
          {want.contact.text ? (
            <p dir="auto" className="whitespace-pre-wrap text-sm">
              {want.contact.text}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {want.contact.email ? (
              <Button asChild variant="outline" tap>
                <a href={`mailto:${want.contact.email}`}>
                  <RiMailLine aria-hidden="true" />
                  <Trans>Email</Trans>
                </a>
              </Button>
            ) : null}
            {want.contact.phone ? (
              <Button asChild variant="outline" tap>
                <a href={`tel:${want.contact.phone}`}>
                  <RiPhoneLine aria-hidden="true" />
                  <Trans>Call</Trans>
                </a>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function WantShareButton({ want }: { want: Pick<Want, "id" | "name"> }) {
  const { t } = useLingui();
  const share = async () => {
    const url = new URL(`/wants/${want.id}`, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: want.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t`Link copied`);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      toast.error(t`Couldn't share this Want.`);
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={() => void share()} aria-label={t`Share`}>
      <RiShareLine aria-hidden="true" />
    </Button>
  );
}
