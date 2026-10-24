import { wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RiCloseLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import {
  MapSheet,
  MapSheetPeek,
  MapSheetTitle,
  type MapSheetSnap,
} from "#/components/ui/map-sheet";
import { WantDetail, WantShareButton } from "#/components/wants/want-detail";
import { WantPicture } from "#/components/wants/want-row";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { wantsClient } from "#/lib/api/wants";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";

type Coordinates = { lat: number; lng: number };

export function WantSheet({
  realFix,
  snap,
  onSnapChange,
  onCoveredHeightChange,
  floating,
}: {
  realFix: Coordinates | null;
  snap: MapSheetSnap;
  onSnapChange: (snap: MapSheetSnap) => void;
  onCoveredHeightChange?: (height: number, snap: MapSheetSnap) => void;
  floating?: ReactNode;
}) {
  const { t } = useLingui();
  const selection = useWantSheetSelection();
  const [id, setId] = useState(selection.want);
  if (selection.want && selection.want !== id) setId(selection.want);
  const query = useQuery({
    ...wantDetailQueryOptions(wantsClient, id ?? ""),
    enabled: !!id,
    retry: false,
  });
  const [reachedHalf, setReachedHalf] = useState(false);
  if (snap !== "peek" && !reachedHalf) setReachedHalf(true);
  if (!id) return null;

  const want = query.data;
  const distance = useMarketDistanceLabel(
    realFix,
    want ? { lat: want.geoLat, lng: want.geoLng } : null,
  );
  return (
    <MapSheet
      open={selection.want !== null}
      modal={false}
      snap={snap}
      onSnapChange={onSnapChange}
      onClose={selection.close}
      onCoveredHeightChange={onCoveredHeightChange}
      floating={floating}
      minimumPeekRatio={1 / 3}
      underBottomNavigation
    >
      <MapSheetPeek className="px-4 pb-4">
        {query.isError ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <MapSheetTitle className="min-w-0 flex-1 text-muted-foreground text-sm">
                <Trans>Couldn't load this Want.</Trans>
              </MapSheetTitle>
              <CloseWantButton label={t`Close`} onClick={selection.close} />
            </div>
            <Button
              variant="outline"
              tap
              pending={query.isFetching}
              onClick={() => query.refetch()}
            >
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : want ? (
          <div className="flex min-h-14 w-full items-center gap-1">
            <button
              type="button"
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-start"
              onClick={() => onSnapChange(snap === "full" ? "peek" : "full")}
            >
              <WantPicture want={want} size="size-12" />
              <span className="min-w-0 flex-1">
                <MapSheetTitle dir="auto" className="truncate">
                  {want.name}
                </MapSheetTitle>
                <span dir="auto" className="mt-1 block truncate text-xs text-muted-foreground">
                  {want.locationName}
                  {distance ? ` · ${distance}` : null}
                </span>
              </span>
            </button>
            <WantShareButton want={want} />
            <CloseWantButton label={t`Close`} onClick={selection.close} />
          </div>
        ) : (
          <div className="flex min-h-14 items-center gap-3">
            <span className="text-sm text-muted-foreground">
              <Trans>Loading Want…</Trans>
            </span>
            <CloseWantButton label={t`Close`} onClick={selection.close} />
          </div>
        )}
      </MapSheetPeek>
      {want && reachedHalf ? (
        <div className="border-t border-border px-4 pb-6 pt-4">
          <WantDetail
            want={want}
            showHeader={false}
            distanceOrigin={realFix}
            showRelated={snap === "full"}
          />
        </div>
      ) : null}
    </MapSheet>
  );
}

function CloseWantButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className="-me-3 shrink-0 border-0 text-muted-foreground"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <RiCloseLine className="size-5" aria-hidden="true" />
    </Button>
  );
}
