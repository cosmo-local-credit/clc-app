import type { Want } from "@clc/core/features/wants/logic";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiArrowRightSLine, RiMessage2Line, RiQuestionLine, RiSpeakLine } from "react-icons/ri";
import type { IconType } from "react-icons";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { cn } from "#/lib/utils";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";

const WANT_ICON: Record<Want["markerIcon"], IconType> = {
  question: RiQuestionLine,
  message: RiMessage2Line,
  request: RiSpeakLine,
};

export function WantPicture({
  want,
  size = "size-11",
}: {
  want: Pick<Want, "effectiveImageUrl" | "markerIcon">;
  size?: string;
}) {
  const Icon = WANT_ICON[want.markerIcon];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border border-warning bg-[color-mix(in_oklab,var(--color-warning)_16%,var(--color-card))] text-warning-foreground",
        size,
      )}
    >
      {want.effectiveImageUrl ? (
        <ProgressiveImage src={want.effectiveImageUrl} alt="" className="size-full object-cover" />
      ) : (
        <Icon className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

export function WantRow({
  want,
  poolAddress,
  distanceOrigin,
}: {
  want: Want;
  poolAddress?: string;
  distanceOrigin?: { lat: number; lng: number } | null;
}) {
  const distance = useMarketDistanceLabel(distanceOrigin ?? null, {
    lat: want.geoLat,
    lng: want.geoLng,
  });
  return (
    <Link
      to="/wants/$wantId"
      params={{ wantId: want.id }}
      search={poolAddress ? { poolAddress } : { from: "market" }}
      className="flex min-h-16 w-full items-center gap-3 border-b border-border p-3 text-start last:border-b-0 active:bg-muted"
    >
      <WantPicture want={want} />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {want.name}
        </span>
        <span dir="auto" className="mt-0.5 block truncate text-xs text-muted-foreground">
          {want.ownerName} · {want.locationName}
          {distance ? ` · ${distance}` : null}
        </span>
        <span className="mt-1.5 flex gap-1 overflow-hidden">
          {want.state === "scheduled" ? (
            <span className="shrink-0 text-2xs font-semibold text-warning-foreground">
              <Trans>Scheduled</Trans>
            </span>
          ) : null}
          {want.tags.slice(0, 3).map((tag) => (
            <TagBadge key={tag} tag={tag} size="sm" />
          ))}
        </span>
      </span>
      <RiArrowRightSLine
        className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100"
        aria-hidden="true"
      />
    </Link>
  );
}
