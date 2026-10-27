import type { MarketMapKind } from "@clc/core/features/market-map/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { RiFocus3Line } from "react-icons/ri";
import { useConnection } from "wagmi";

import { useViewportScopedSearch } from "#/components/market-viewport-search-notice";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { Progress, ProgressTrack } from "#/components/ui/progress";
import { useMarketScreen } from "#/features/home/hooks/use-market-screen";
import { MarketMap } from "#/features/home/ui/market-map.lazy";
import type { MarketListScope } from "#/lib/navigation/marketplace-search";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";
import { MarketAvatar, MarketKindBadge } from "#/desktop/market/market-bits";
import { MarketMapNotice } from "#/desktop/market/market-notices";
import { MarketDeskToolbar } from "#/desktop/market/market-toolbar";
import { DeskChip } from "#/desktop/ui/segment";
import { MarketPlacePanel } from "#/desktop/market/place-panel";

const SCOPE_KINDS: Record<Exclude<MarketListScope, "all">, readonly MarketMapKind[]> = {
  offers: ["voucher"],
  wants: ["want"],
  vouchers: ["voucher"],
  pools: ["pool"],
  catalogs: ["catalog"],
};

export function MarketMapDesk({
  isAuthenticated = false,
  creditableSearch,
  scope = "all",
  creditRoute = "home",
  view,
}: {
  isAuthenticated?: boolean;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  scope?: MarketListScope;
  creditRoute?: "home" | "market";
  view?: "map" | "list";
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address } = useConnection();
  const locationOwner = isAuthenticated && address ? address.toLowerCase() : GUEST_STORAGE_OWNER;
  const kinds = scope === "all" ? undefined : SCOPE_KINDS[scope];
  const screen = useMarketScreen({
    isAuthenticated,
    locationOwner,
    creditableSearch,
    kinds,
    creditRoute,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverFromMap = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (creditRoute !== "market" || view === "map") return;
    void navigate({
      to: "/market",
      search: (previous) => ({ ...previous, view: "map" as const }),
      replace: true,
    });
  }, [creditRoute, navigate, view]);

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

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="relative flex w-[400px] shrink-0 flex-col border-border border-e bg-card">
        <div
          className={cn("flex min-h-0 flex-1 flex-col", screen.isCardOpen && "invisible")}
          inert={screen.isCardOpen || undefined}
        >
          <MarketDeskToolbar
            layout="column"
            scope={scope}
            filter={screen.filter}
            facets={screen.tagFacets}
            filtersOpen={screen.filtersOpen}
            onFiltersOpenChange={(next) => {
              if (next) screen.setFiltersEverOpened(true);
              screen.setFiltersOpen(next);
            }}
            credit={screen.credit}
            onCredit={screen.changeCredit}
          />
          {screen.isFetching ? <MapLoading label={t`Loading marketplace…`} /> : null}
          <div className="shrink-0 border-border border-b px-3.5 py-2.5 text-xs text-muted-foreground">
            <Trans>{screen.locations.length} results</Trans>
          </div>
          {screen.mapStatus ? (
            <div className="shrink-0 border-border border-b p-3.5">
              <MarketMapNotice
                status={screen.mapStatus}
                credit={screen.credit}
                onClearCredit={screen.clearCredit}
                onClearFilters={screen.filter.clear}
              />
            </div>
          ) : null}
          {/* Stays mounted under the place panel, so Back returns to the same scroll position. */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {screen.locations.map((location) => (
              <MapResultRow
                key={location.id}
                location={location}
                realFix={screen.realFix}
                selected={location.id === (screen.selectedLocationId ?? hoveredId)}
                onHover={(hovering) => {
                  hoverFromMap.current = false;
                  setHoveredId((current) =>
                    hovering ? location.id : current === location.id ? null : current,
                  );
                }}
                onSelect={() => screen.handleSelectLocation(location.id)}
              />
            ))}
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
        {areaScoped ? (
          <div className="pointer-events-none absolute end-4 top-4">
            <DeskChip>
              <span role="status">
                <RiFocus3Line aria-hidden="true" />
                <Trans>Searching this area</Trans>
              </span>
            </DeskChip>
          </div>
        ) : null}
        {screen.isCardOpen ? null : (
          <div className="pointer-events-none absolute end-4 bottom-4">{screen.locationButton}</div>
        )}
      </div>
    </div>
  );
}

type MapLocation = ReturnType<typeof useMarketScreen>["locations"][number];

function MapResultRow({
  location,
  realFix,
  selected,
  onHover,
  onSelect,
}: {
  location: MapLocation;
  realFix: { lat: number; lng: number } | null;
  selected: boolean;
  onHover: (hovering: boolean) => void;
  onSelect: () => void;
}) {
  const distance = useMarketDistanceLabel(realFix, { lat: location.lat, lng: location.lng });
  return (
    <button
      type="button"
      data-desktop-row=""
      data-location-id={location.id}
      className={cn(
        "flex min-h-[61px] w-full items-center gap-3 border-border border-b px-3.5 py-2.5 text-start",
        selected
          ? "bg-primary/[0.07] shadow-[inset_2px_0_0_var(--color-primary)]"
          : "hover:bg-muted/60",
      )}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onClick={onSelect}
    >
      <MarketAvatar name={location.name} seed={location.resourceId} kind={location.kind} />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {location.name}
        </span>
        {distance ? (
          <span className="block truncate text-xs text-muted-foreground">{distance}</span>
        ) : null}
      </span>
      <MarketKindBadge kind={location.kind} />
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
