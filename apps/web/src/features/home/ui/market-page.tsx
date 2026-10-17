import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useMemo, useState } from "react";
import { RiFocus3Line } from "react-icons/ri";

import { CreditableBrowseControl, hasCreditFeedback } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import { Button } from "#/components/ui/button";
import type { MapSheetSnap } from "#/components/ui/map-sheet";
import { useVoucherSheetSnap, VoucherSheet } from "#/components/vouchers/voucher-sheet";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  CAMERA_RANK,
  REAL_FIX_ZOOM,
  useMarketCamera,
} from "#/features/home/hooks/use-market-camera";
import { useMarketCatalogVouchers } from "#/features/home/hooks/use-market-catalog";
import { useMarketMapPools } from "#/features/home/hooks/use-market-pools";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useMarketplaceMapSearch } from "#/features/home/hooks/use-marketplace-map-search";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { cn } from "#/lib/utils";
import { MarketFilterSheet, useMarketFilterNotice } from "./market-filter-ui";
import type { MarketCamera, MarketViewport } from "./market-map";
import { MarketMap } from "./market-map.lazy";

type Coordinates = { lat: number; lng: number };

export function MarketPage({
  isAuthenticated = false,
  locationOwner = GUEST_STORAGE_OWNER,
  creditableSearch,
}: {
  isAuthenticated?: boolean;
  locationOwner?: string;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
}) {
  const { t } = useLingui();
  const {
    camera: automaticCamera,
    realFix,
    userLocation,
    locationStatus,
    requestLocation,
  } = useMarketCamera(locationOwner);
  const [viewport, setViewport] = useState<MarketViewport | null>(null);
  const selection = useVoucherSheetSelection();

  // A link that opens the market on a card centres the map on its voucher,
  // which may lie far outside anything the catalog has loaded.
  const [linkedVoucher] = useState(selection.voucher);
  const linkedDetail = useMarketVoucherDetail(linkedVoucher ?? undefined).data;
  const linkedLat = linkedDetail?.lat ?? undefined;
  const linkedLng = linkedDetail?.lng ?? undefined;
  const voucherCamera = useMemo<MarketCamera | null>(
    () =>
      linkedLat !== undefined && linkedLng !== undefined
        ? {
            lat: linkedLat,
            lng: linkedLng,
            zoom: REAL_FIX_ZOOM,
            rank: CAMERA_RANK.selectedVoucher,
          }
        : null,
    [linkedLat, linkedLng],
  );

  // Otherwise the map opens on the profile's saved location. It outranks every
  // automatic source, so only the location button's explicit fix takes the map
  // off it.
  const profileQuery = useAuthProfile({ enabled: isAuthenticated });
  const saved = isAuthenticated ? profileCoordinates(profileQuery.data) : null;
  const savedLat = saved?.lat;
  const savedLng = saved?.lng;
  const savedCamera = useMemo<MarketCamera | null>(
    () =>
      savedLat !== undefined && savedLng !== undefined
        ? { lat: savedLat, lng: savedLng, zoom: REAL_FIX_ZOOM, rank: CAMERA_RANK.savedProfile }
        : null,
    [savedLat, savedLng],
  );
  const camera =
    automaticCamera?.rank === CAMERA_RANK.explicit
      ? automaticCamera
      : (voucherCamera ?? savedCamera ?? automaticCamera);

  const filter = useMarketFilter(useStorageOwner());
  const credit = useCreditableBrowse(creditableSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const usesUnifiedSearch = filter.isFiltered || credit.enabled;
  const catalog = useMarketCatalogVouchers(
    filter,
    viewport,
    !filter.isRestoringPreference && !credit.blocksResults,
    filtersEverOpened,
    credit.enabled ? credit.poolRefs : undefined,
  );
  const { vouchers, isCatalogComplete, error, retry, retrying } = catalog;
  // The filter's terms and tags are a voucher vocabulary, so a filtered map
  // shows only the vouchers it matched.
  const poolCatalog = useMarketMapPools(!filter.isRestoringPreference && !usesUnifiedSearch);
  const { pools } = poolCatalog;
  const unifiedSearch = useMarketplaceMapSearch(
    filter,
    credit.enabled ? credit.poolRefs : undefined,
    usesUnifiedSearch && !filter.isRestoringPreference && filter.result.ok && !credit.blocksResults,
  );
  // Pools go last: a stack is keyed by its first member, so pools arriving
  // after the vouchers do not re-key a fan the viewer has open.
  const locations = useMemo(() => {
    if (usesUnifiedSearch) return unifiedSearch.locations;
    return pools.length === 0 ? vouchers : [...vouchers, ...pools];
  }, [pools, unifiedSearch.locations, usesUnifiedSearch, vouchers]);

  const fitBounds = useMemo(() => {
    if (!usesUnifiedSearch || unifiedSearch.status !== "ready" || locations.length === 0)
      return null;

    let west = locations[0]!.lng;
    let east = locations[0]!.lng;
    let south = locations[0]!.lat;
    let north = locations[0]!.lat;
    for (const location of locations) {
      west = Math.min(west, location.lng);
      east = Math.max(east, location.lng);
      south = Math.min(south, location.lat);
      north = Math.max(north, location.lat);
    }
    return { key: `${catalog.filterKey}:${credit.enabled}`, west, south, east, north };
  }, [catalog.filterKey, credit.enabled, locations, unifiedSearch.status, usesUnifiedSearch]);

  const isCardOpen = selection.voucher !== null;
  const [snap, setSnap] = useVoucherSheetSnap(isCardOpen);
  const cardAddress = selection.voucher?.toLowerCase() ?? null;
  const cardCatalogVoucher = useMemo(
    () => vouchers.find((voucher) => voucher.address.toLowerCase() === cardAddress) ?? null,
    [vouchers, cardAddress],
  );
  const selectedLocationId =
    locations.find(
      (location) => "address" in location && location.address.toLowerCase() === cardAddress,
    )?.id ?? null;

  const [sheetInset, setSheetInset] = useState(0);
  const handleCoveredHeightChange = useCallback((height: number, at: MapSheetSnap) => {
    // At full the map is out of sight: keep framing the area it last showed.
    if (at !== "full") setSheetInset(height);
  }, []);
  // Panning never fights a half-height card.
  const handleUserPan = useCallback(() => {
    setSnap((current) => (current === "half" ? "peek" : current));
  }, []);

  const locationButtonLabel =
    locationStatus === "requesting"
      ? t`Finding location`
      : locationStatus === "denied"
        ? t`Location denied`
        : locationStatus === "unavailable"
          ? t`Location unavailable`
          : t`Use current location`;

  const navigate = useNavigate();
  const { open } = selection;
  const handleSelectLocation = useCallback(
    (id: string) => {
      const location = locations.find((candidate) => candidate.id === id);
      if (!location) return;
      if (location.kind === "pool") {
        void navigate({
          to: "/pools/$poolAddress",
          params: { poolAddress: location.address },
        });
        return;
      }
      const voucher = "address" in location ? location : undefined;
      if (voucher) open(voucher.address);
    },
    [locations, navigate, open],
  );

  const handleViewportSettled = useCallback((settled: MarketViewport) => {
    setViewport(settled);
  }, []);

  // The vouchers' notice wins: their retry is the one that fills an empty map.
  const notice =
    useMarketFilterNotice(filter, error, retry, retrying) ??
    (unifiedSearch.error
      ? {
          message: t`Couldn't load complete marketplace results.`,
          actionLabel: t`Retry`,
          onAction: unifiedSearch.retry,
          actionPending: unifiedSearch.retrying,
        }
      : null) ??
    (poolCatalog.error
      ? {
          message: t`Couldn't load pools.`,
          actionLabel: t`Retry`,
          onAction: poolCatalog.retry,
          actionPending: poolCatalog.retrying,
        }
      : null);

  const locationButton = (
    <Button
      size="icon-lg"
      className="pointer-events-auto bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
      aria-label={locationButtonLabel}
      disabled={
        locationStatus === "requesting" ||
        locationStatus === "denied" ||
        locationStatus === "unavailable"
      }
      onClick={requestLocation}
    >
      <RiFocus3Line className="size-5" aria-hidden="true" />
    </Button>
  );

  const isEmpty =
    locations.length === 0 &&
    filter.result.ok &&
    (usesUnifiedSearch ? unifiedSearch.status === "ready" : isCatalogComplete);

  const changeCredit = (checked: boolean) =>
    void navigate({
      to: "/",
      search: (previous) => ({ ...previous, tab: "market", view: "map", creditable: checked }),
    });
  const clearCredit = () =>
    void navigate({
      to: "/",
      replace: true,
      search: (previous) => ({ ...previous, tab: "market", view: "map", creditable: false }),
    });

  const mapNotice = hasCreditFeedback(credit) ? (
    <CreditableBrowseControl
      part="feedback"
      state={credit}
      onChange={changeCredit}
      onClear={clearCredit}
    />
  ) : credit.enabled && credit.poolRefs?.length === 0 ? (
    <div className="border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
      <Trans>No marketplace results are available through your Credit pools.</Trans>
    </div>
  ) : notice ? (
    <div
      className="flex items-center justify-between gap-3 border border-border bg-card px-4 py-3"
      role="alert"
    >
      <span className="min-w-0 text-sm">{notice.message}</span>
      {notice.actionLabel && notice.onAction ? (
        <Button variant="outline" tap pending={notice.actionPending} onClick={notice.onAction}>
          {notice.actionLabel}
        </Button>
      ) : null}
    </div>
  ) : isEmpty ? (
    <div className="space-y-3 border border-border bg-card px-4 py-3 text-center text-muted-foreground text-sm">
      {filter.isFiltered ? (
        <>
          <p>
            <Trans>No marketplace results match this search.</Trans>
          </p>
          <Button variant="outline" tap onClick={filter.clear}>
            <Trans>Clear filters</Trans>
          </Button>
        </>
      ) : (
        <Trans>No marketplace results to show yet.</Trans>
      )}
    </div>
  ) : null;

  return (
    <main className="relative h-[100svh] overflow-hidden bg-card">
      <h1 className="sr-only">
        <Trans>Market</Trans>
      </h1>
      <Suspense
        fallback={<div className="market-map-fallback absolute inset-0 h-full w-full bg-card" />}
      >
        <MarketMap
          locations={locations}
          selectedLocationId={selectedLocationId}
          camera={camera}
          fitBounds={fitBounds}
          cameraScope={locationOwner}
          userLocation={userLocation}
          onSelectLocation={handleSelectLocation}
          onDeselect={selection.close}
          onUserPan={handleUserPan}
          bottomInset={isCardOpen ? sheetInset : 0}
          onViewportSettled={handleViewportSettled}
          className="absolute inset-0 h-full w-full"
        />
      </Suspense>

      <MarketBar
        current="map"
        surface="map"
        className={cn(
          "absolute inset-x-4 top-[calc(env(safe-area-inset-top)+1rem)]",
          isCardOpen ? "z-20" : "z-30",
        )}
        filter={filter}
        searchLabel={t`Search the marketplace`}
        credit={
          <CreditableBrowseControl
            part="control"
            state={credit}
            onChange={changeCredit}
            onClear={clearCredit}
          />
        }
        filters={
          <MarketFilterSheet
            filter={filter}
            facets={catalog.tagFacets}
            open={filtersOpen}
            onOpenChange={(next) => {
              if (next) setFiltersEverOpened(true);
              setFiltersOpen(next);
            }}
          />
        }
      />

      {/* One notice at a time, under the badges: the first that applies wins. */}
      {mapNotice ? (
        <div className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+7.5rem)] z-20">
          <div className="pointer-events-auto">{mapNotice}</div>
        </div>
      ) : null}

      {/* With a card open, only the location button stays, riding the sheet. */}
      {isCardOpen ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(var(--bottom-nav-offset),env(safe-area-inset-bottom))+1.25rem)] z-20 flex flex-col gap-2 px-4">
          <div className="flex justify-end">{locationButton}</div>
        </div>
      )}

      <VoucherSheet
        modal={false}
        placeholder={cardCatalogVoucher}
        realFix={realFix}
        snap={snap}
        onSnapChange={setSnap}
        onCoveredHeightChange={handleCoveredHeightChange}
        floating={locationButton}
        bottomNavigationVisible
      />
    </main>
  );
}

function profileCoordinates(
  profile: { geoLat?: number | null; geoLng?: number | null } | null | undefined,
): Coordinates | null {
  const lat = profile?.geoLat;
  const lng = profile?.geoLng;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}
