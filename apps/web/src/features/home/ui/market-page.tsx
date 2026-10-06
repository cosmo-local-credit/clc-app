import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { RiFocus3Line, RiListUnordered } from "react-icons/ri";

import { AppMenu } from "#/components/app-menu";
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
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { MarketFilterSummary, useMarketFilterNotice } from "./market-filter-ui";
import type { MarketCamera, MarketViewport } from "./market-map";
import { MarketMap } from "./market-map.lazy";

type Coordinates = { lat: number; lng: number };

export function MarketPage({
  onboardingBanner,
  isAuthenticated = false,
  locationOwner = GUEST_STORAGE_OWNER,
}: {
  onboardingBanner?: ReactNode;
  isAuthenticated?: boolean;
  locationOwner?: string;
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
  const catalog = useMarketCatalogVouchers(filter, viewport, !filter.isRestoringPreference);
  const { vouchers, isCatalogComplete, error, retry } = catalog;
  // The filter's terms and tags are a voucher vocabulary, so a filtered map
  // shows only the vouchers it matched.
  const pools = useMarketMapPools(!filter.isRestoringPreference && !filter.isFiltered);
  // Pools go last: a stack is keyed by its first member, so pools arriving
  // after the vouchers do not re-key a fan the viewer has open.
  const locations = useMemo(
    () => (pools.length === 0 ? vouchers : [...vouchers, ...pools]),
    [vouchers, pools],
  );

  const fitBounds = useMemo(() => {
    if (!filter.isFiltered || catalog.status !== "ready" || vouchers.length === 0) return null;

    let west = vouchers[0]!.lng;
    let east = vouchers[0]!.lng;
    let south = vouchers[0]!.lat;
    let north = vouchers[0]!.lat;
    for (const voucher of vouchers) {
      west = Math.min(west, voucher.lng);
      east = Math.max(east, voucher.lng);
      south = Math.min(south, voucher.lat);
      north = Math.max(north, voucher.lat);
    }
    return { key: catalog.filterKey, west, south, east, north };
  }, [filter.isFiltered, catalog.status, catalog.filterKey, vouchers]);

  const isCardOpen = selection.voucher !== null;
  const [snap, setSnap] = useVoucherSheetSnap(isCardOpen);
  const cardAddress = selection.voucher?.toLowerCase() ?? null;
  const cardCatalogVoucher = useMemo(
    () => vouchers.find((voucher) => voucher.address.toLowerCase() === cardAddress) ?? null,
    [vouchers, cardAddress],
  );
  const selectedLocationId = cardCatalogVoucher?.id ?? null;

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
      const pool = pools.find((candidate) => candidate.id === id);
      if (pool) {
        void navigate({ to: "/pools/$poolAddress", params: { poolAddress: pool.address } });
        return;
      }
      const voucher = vouchers.find((candidate) => candidate.id === id);
      if (voucher) open(voucher.address);
    },
    [navigate, open, pools, vouchers],
  );

  const handleViewportSettled = useCallback((settled: MarketViewport) => {
    setViewport(settled);
  }, []);

  const notice = useMarketFilterNotice(filter, error, retry);

  const locationButton = (
    <Button
      size="icon-lg"
      className="pointer-events-auto h-11 w-11 shrink-0 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
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
    vouchers.length === 0 &&
    filter.result.ok &&
    (filter.isFiltered ? catalog.status === "ready" : isCatalogComplete);

  return (
    <main className="relative h-[100svh] overflow-hidden bg-card">
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

      <AppMenu className="absolute start-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30" />

      {onboardingBanner ? (
        <div className="pointer-events-none absolute start-[4.75rem] end-0 top-[calc(env(safe-area-inset-top)+1rem)] z-20 pe-4">
          {onboardingBanner}
        </div>
      ) : null}

      {notice ? (
        <div
          className="absolute inset-x-4 z-20 flex items-center justify-between gap-3 border border-border bg-card px-4 py-3"
          role="alert"
        >
          <span className="min-w-0 text-sm">{notice.message}</span>
          {notice.actionLabel && notice.onAction ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 bg-card"
              onClick={notice.onAction}
            >
              {notice.actionLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      {isEmpty && !notice ? (
        <div className="absolute inset-x-4 z-20 space-y-3 border border-border bg-card px-4 py-3 text-center text-muted-foreground text-sm">
          {filter.isFiltered ? (
            <>
              <p>
                <Trans>No vouchers match this search.</Trans>
              </p>
              <Button variant="outline" size="sm" className="h-9 bg-card" onClick={filter.clear}>
                <Trans>Clear filters</Trans>
              </Button>
            </>
          ) : (
            <Trans>No vouchers to show yet.</Trans>
          )}
        </div>
      ) : null}

      {/* With a card open, only the location button stays, riding the sheet. */}
      {isCardOpen ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(var(--bottom-nav-offset),env(safe-area-inset-bottom))+1.25rem)] z-20 flex flex-col gap-2 px-4">
          <MarketFilterSummary filter={filter} />
          <div className="flex items-center gap-2">
            <Button asChild className="pointer-events-auto h-11 flex-1">
              <Link to="/" search={(previous) => ({ ...previous, tab: "market", view: "list" })}>
                <RiListUnordered className="me-2 size-4" aria-hidden="true" />
                <Trans>Browse all</Trans>
              </Link>
            </Button>
            {locationButton}
          </div>
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
