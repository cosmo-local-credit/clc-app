import type { MarketMapKind } from "@clc/core/features/market-map/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Progress, ProgressTrack } from "#/components/ui/progress";
import { useMarketScreen } from "#/features/home/hooks/use-market-screen";
import { MarketMap } from "#/features/home/ui/market-map.lazy";
import type { MarketListScope } from "#/lib/navigation/marketplace-search";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";
import { MarketDeskToolbar } from "#/desktop/market/market-toolbar";
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

  const pinId = screen.selectedLocationId ?? (screen.isCardOpen ? null : hoveredId);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex w-[400px] shrink-0 flex-col border-border border-e bg-background">
        <MarketDeskToolbar
          scope={scope}
          view="map"
          filter={screen.filter}
          facets={screen.tagFacets}
          filtersOpen={screen.filtersOpen}
          onFiltersOpenChange={(next) => {
            if (next) screen.setFiltersEverOpened(true);
            screen.setFiltersOpen(next);
          }}
          credit={screen.credit}
          onCredit={screen.changeCredit}
          onClearCredit={screen.clearCredit}
          count={screen.locations.length}
          searchAttribute
        />
        {screen.isFetching ? <MapLoading label={t`Loading marketplace…`} /> : null}
        {screen.mapNotice ? (
          <div className="border-border border-b p-3">{screen.mapNotice}</div>
        ) : null}
        <div className="relative min-h-0 flex-1">
          <div
            ref={listRef}
            className={cn("h-full overflow-auto", screen.isCardOpen && "invisible")}
            aria-hidden={screen.isCardOpen}
          >
            {screen.locations.map((location) => {
              const on = location.id === (screen.selectedLocationId ?? hoveredId);
              return (
                <button
                  key={location.id}
                  type="button"
                  data-desktop-row=""
                  data-location-id={location.id}
                  className={cn(
                    "flex w-full items-center gap-3 border-s-2 px-4 py-2.5 text-start",
                    on
                      ? "border-s-primary bg-primary/[0.07]"
                      : "border-s-transparent hover:bg-muted",
                  )}
                  onMouseEnter={() => {
                    hoverFromMap.current = false;
                    setHoveredId(location.id);
                  }}
                  onMouseLeave={() =>
                    setHoveredId((current) => (current === location.id ? null : current))
                  }
                  onFocus={(event) => {
                    hoverFromMap.current = false;
                    setHoveredId(location.id);
                    if (!event.currentTarget.matches(":focus-visible") || !screen.isCardOpen)
                      return;
                    screen.handleSelectLocation(location.id);
                  }}
                  onClick={() => screen.handleSelectLocation(location.id)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center bg-muted font-heading text-xs font-semibold">
                    {initials(location.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-sm font-semibold">
                      {location.name}
                    </span>
                  </span>
                  <Badge size="sm" variant="outline">
                    <KindLabel kind={location.resourceKind} />
                  </Badge>
                </button>
              );
            })}
          </div>
          {screen.isCardOpen ? (
            <div className="absolute inset-0 overflow-hidden bg-card">
              <MarketPlacePanel realFix={screen.realFix} />
            </div>
          ) : null}
        </div>
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
        {screen.isCardOpen ? null : (
          <div className="pointer-events-none absolute end-4 bottom-4">{screen.locationButton}</div>
        )}
      </div>
    </div>
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

function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "?";
}

function KindLabel({ kind }: { kind: string }) {
  if (kind === "want") return <Trans>Wants</Trans>;
  if (kind === "pool") return <Trans>Pools</Trans>;
  if (kind === "catalog") return <Trans>Catalogs</Trans>;
  if (kind === "post") return <Trans>Posts</Trans>;
  return <Trans>Vouchers</Trans>;
}
