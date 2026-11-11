import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { RiFocus3Line } from "react-icons/ri";
import { useConnection } from "wagmi";

import { useViewportScopedSearch } from "#/components/market-viewport-search-notice";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { Progress, ProgressTrack } from "#/components/ui/progress";
import { Spinner } from "#/components/ui/spinner";
import { Button } from "#/components/ui/button";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useMarketScreen } from "#/features/home/hooks/use-market-screen";
import { useOutputVoucherBrowse } from "#/features/home/hooks/use-output-voucher-browse";
import { MarketMap } from "#/features/home/ui/market-map.lazy";
import type { MarketListScope } from "#/lib/navigation/marketplace-search";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { cn } from "#/lib/utils";
import { DeskSignInAction } from "#/desktop/auth/sign-in-action";
import { MarketAvatar, MarketKindBadge } from "#/desktop/market/market-bits";
import { useClearMarketNarrowing, useClearOutputVoucher } from "#/desktop/market/market-narrowing";
import { MarketMapNotice, MarketOutputNotice } from "#/desktop/market/market-notices";
import { MarketDeskToolbar } from "#/desktop/market/market-toolbar";
import { useRememberMarketView } from "#/desktop/market/market-view";
import { useMarketViewportList } from "#/desktop/market/use-market-viewport-list";
import { DeskChip } from "#/desktop/ui/segment";
import { MarketPlacePanel } from "#/desktop/market/place-panel";
import { DESK_SELECTED } from "#/desktop/ui/page";

export function MarketMapDesk({
  isAuthenticated = false,
  creditableSearch,
  outputVoucherSearch,
  scope: _scope = "all",
  creditRoute = "home",
}: {
  isAuthenticated?: boolean;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  /** The link's requested output voucher; it narrows the Pools map to pools that can pay it out. */
  outputVoucherSearch?: string | readonly string[];
  scope?: MarketListScope;
  creditRoute?: "home" | "market";
}) {
  const { t } = useLingui();
  useRememberMarketView("map");
  const { address } = useConnection();
  const locationOwner = isAuthenticated && address ? address.toLowerCase() : GUEST_STORAGE_OWNER;
  const clearNarrowing = useClearMarketNarrowing();
  const clearOutput = useClearOutputVoucher();
  // The requested output reads Credit too, to intersect with it. This is the
  // same Credit the screen reads (one set of queries), taken first so the
  // screen can send the one pool restriction.
  const credit = useCreditableBrowse(creditableSearch);
  const output = useOutputVoucherBrowse(outputVoucherSearch, credit);
  const screen = useMarketScreen({
    isAuthenticated,
    locationOwner,
    creditableSearch,
    creditRoute,
    output,
    alsoClear: clearNarrowing,
  });
  const viewportList = useMarketViewportList({
    filter: screen.filter,
    credit: screen.credit,
    output,
    kinds: screen.activeKinds,
    bounds: screen.exactBounds,
    settled: screen.hasSettledViewport,
  });
  const narrowed = screen.filter.isFiltered || screen.credit.enabled || output.active;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverFromMap = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !viewportList.next.hasMore ||
      viewportList.next.failed ||
      viewportList.next.loading ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) viewportList.next.load();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [viewportList.next]);

  useEffect(() => {
    if (!hoverFromMap.current || !hoveredId || screen.isCardOpen) return;
    listRef.current
      ?.querySelector(`[data-location-id="${CSS.escape(hoveredId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [hoveredId, screen.isCardOpen]);

  // The map re-runs its bbox query on every settle, so a text search is always
  // this area's; the chip says so, as the phone list's viewport notice does.
  const areaScoped = useViewportScopedSearch(screen.filter.term);
  const pinId = screen.selectedLocationId ?? (screen.isCardOpen ? null : hoveredId);
  const navigate = useNavigate();
  const openResult = useCallback(
    (row: MarketplaceResult) => {
      if (row.kind === "voucher" && row.address) {
        const address = parseVoucherAddress(row.address);
        if (address) screen.voucherSelection.open(address);
      } else if (row.kind === "want") {
        screen.wantSelection.open(row.id);
      } else if (row.kind === "pool" && row.address) {
        if (isAuthenticated && output.address) {
          void navigate({
            to: "/pools/$poolAddress/swap",
            params: { poolAddress: row.address },
            search: { receive: output.address },
          });
        } else {
          void navigate({ to: "/pools/$poolAddress", params: { poolAddress: row.address } });
        }
      } else if (row.kind === "catalog") {
        void navigate({ to: "/catalogs/$catalogId", params: { catalogId: row.id } });
      } else if (row.kind === "post") {
        void navigate({ to: "/posts/$reportId", params: { reportId: row.id } });
      }
    },
    [isAuthenticated, navigate, output.address, screen.voucherSelection, screen.wantSelection],
  );

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="relative flex w-[400px] shrink-0 flex-col border-border border-e bg-card @min-[72rem]:w-[440px] @min-[100rem]:w-[480px]">
        <div
          className={cn("flex min-h-0 flex-1 flex-col", screen.isCardOpen && "invisible")}
          inert={screen.isCardOpen || undefined}
        >
          <MarketDeskToolbar
            layout="column"
            scope="all"
            filter={screen.filter}
            facets={screen.tagFacets}
            filtersOpen={screen.filtersOpen}
            onFiltersOpenChange={(next) => {
              if (next) screen.setFiltersEverOpened(true);
              screen.setFiltersOpen(next);
            }}
            credit={screen.credit}
            onCredit={screen.changeCredit}
            output={output}
            onClearOutput={clearOutput}
            layers={screen.mapResources}
          />
          {screen.isFetching || viewportList.loading || viewportList.refreshing ? (
            <MapLoading label={t`Loading marketplace…`} />
          ) : null}
          <div
            aria-live="polite"
            className="shrink-0 px-3.5 pt-2 pb-2.5 text-xs text-muted-foreground empty:hidden"
          >
            {viewportList.blocked ? null : viewportList.hasData ? (
              <Trans>
                Showing {viewportList.rows.length} of {viewportList.total} in this area
              </Trans>
            ) : screen.results.state === "unavailable" ? (
              <Trans>Results unavailable</Trans>
            ) : (
              <span className="flex items-center gap-1.5">
                <Spinner />
                <Trans>Loading marketplace…</Trans>
              </span>
            )}
            {viewportList.hasData && !screen.realFix ? (
              <span className="ms-2">
                <Trans>Sorted nearest to the map view</Trans>
              </span>
            ) : null}
          </div>
          <div className="grid shrink-0 gap-2 border-border border-b p-3.5 empty:hidden">
            <MarketOutputNotice
              output={output}
              credit={screen.credit}
              onClear={clearOutput}
              onClearAll={screen.clearFilters}
            />
            <MarketMapNotice
              status={screen.mapStatus}
              credit={screen.credit}
              narrowed={narrowed}
              onClearCredit={screen.clearCredit}
              onClearFilters={screen.clearFilters}
              onResetLayers={screen.mapResources.reset}
            />
          </div>
          {/* Stays mounted under the place panel, so Back returns to the same scroll position. */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {viewportList.error ? (
              <div className="flex items-center justify-between gap-3 border-border border-b px-3.5 py-2.5 text-sm">
                <Trans>Couldn't load all results in this area.</Trans>
                <Button variant="outline" onClick={viewportList.retry}>
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : null}
            {viewportList.rows.map((row) => {
              const locationId = markerIdForResult(row, screen.locations);
              return (
                <MapResultRow
                  key={`${row.kind}:${row.id}`}
                  row={row}
                  locationId={locationId}
                  realFix={screen.realFix}
                  selected={
                    locationId !== null && locationId === (screen.selectedLocationId ?? hoveredId)
                  }
                  onHover={(hovering) => {
                    hoverFromMap.current = false;
                    setHoveredId((current) =>
                      hovering ? locationId : current === locationId ? null : current,
                    );
                  }}
                  onSelect={() => openResult(row)}
                />
              );
            })}
            <div ref={loadMoreRef} className="h-px" />
            {viewportList.next.hasMore || viewportList.next.failed ? (
              <div className="p-3.5">
                <Button
                  variant="outline"
                  pending={viewportList.next.loading}
                  onClick={viewportList.next.load}
                >
                  {viewportList.next.failed ? <Trans>Retry</Trans> : <Trans>Load more</Trans>}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {screen.isCardOpen ? (
          <div className="absolute inset-0 bg-card">
            <MarketPlacePanel realFix={screen.realFix} />
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 bg-card">
        <h1 className="sr-only">
          <Trans>Market</Trans>
        </h1>
        {screen.cameraBootstrapPending ? (
          <div className="absolute inset-0 bg-card" />
        ) : (
          <Suspense fallback={<div className="absolute inset-0 bg-card" />}>
            <MarketMap
              locations={screen.locations}
              clusters={screen.clusters}
              selectedLocationId={pinId}
              camera={screen.camera}
              fitBounds={null}
              cameraScope={locationOwner}
              userLocation={screen.userLocation}
              onSelectLocation={screen.handleSelectLocation}
              onHoverLocation={(id) => {
                hoverFromMap.current = true;
                setHoveredId(id);
              }}
              onDeselect={screen.closeSelection}
              onViewportSettled={screen.handleViewportSettled}
              bottomInset={0}
              className="absolute inset-0 h-full w-full"
            />
          </Suspense>
        )}
        {/* The map chrome has no top bar, so this corner is the shell's top-right. */}
        <div className="absolute end-4 top-4 flex items-center gap-2 empty:hidden">
          {areaScoped ? (
            <div className="pointer-events-none">
              <DeskChip>
                <span role="status">
                  <RiFocus3Line aria-hidden="true" />
                  <Trans>Searching this area</Trans>
                </span>
              </DeskChip>
            </div>
          ) : null}
          <DeskSignInAction />
        </div>
        {screen.isCardOpen ? null : (
          <div className="pointer-events-none absolute end-4 bottom-4">{screen.locationButton}</div>
        )}
      </div>
    </div>
  );
}

type MapLocation = ReturnType<typeof useMarketScreen>["locations"][number];

function markerIdForResult(
  row: MarketplaceResult,
  locations: readonly MapLocation[],
): string | null {
  const resourceId = row.kind === "voucher" || row.kind === "pool" ? row.address : row.id;
  if (!resourceId) return null;
  return (
    locations.find(
      (location) =>
        location.resourceKind === row.kind &&
        location.resourceId.toLowerCase() === resourceId.toLowerCase(),
    )?.id ?? null
  );
}

function MapResultRow({
  row,
  locationId,
  realFix,
  selected,
  onHover,
  onSelect,
}: {
  row: MarketplaceResult;
  locationId: string | null;
  realFix: { lat: number; lng: number } | null;
  selected: boolean;
  onHover: (hovering: boolean) => void;
  onSelect: () => void;
}) {
  const distance = useMarketDistanceLabel(realFix, { lat: row.geoLat, lng: row.geoLng });
  const kind = row.kind === "voucher" ? row.voucherKind : row.kind;
  return (
    <button
      type="button"
      data-desktop-row=""
      data-location-id={locationId ?? undefined}
      className={cn(
        "flex min-h-[61px] w-full items-center gap-3 border-border border-b px-3.5 py-2.5 text-start",
        selected ? DESK_SELECTED : "hover:bg-muted/60",
      )}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onClick={onSelect}
    >
      <MarketAvatar name={row.name} seed={row.address ?? row.id} kind={kind} />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {row.name}
        </span>
        {distance ? (
          <span className="block truncate text-xs text-muted-foreground">{distance}</span>
        ) : null}
      </span>
      <MarketKindBadge kind={kind} />
    </button>
  );
}

function MapLoading({ label }: { label: string }) {
  return (
    <Progress value={null} aria-label={label} className="h-0.5 overflow-hidden bg-card">
      <ProgressTrack className="h-full w-full">
        <div className="market-results-loading-indicator h-full bg-primary" />
      </ProgressTrack>
    </Progress>
  );
}
