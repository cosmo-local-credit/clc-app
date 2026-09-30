import { Trans, useLingui } from "@lingui/react/macro";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import { Link } from "@tanstack/react-router";
import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { RiArrowRightSLine, RiFocus3Line, RiListUnordered } from "react-icons/ri";

import { AppMenu, type SavedLocationAction } from "#/components/app-menu";
import { Button } from "#/components/ui/button";
import { VoucherAvatar } from "#/components/wallet";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import type { MarketVoucher } from "@clc/api/features/market/client";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { REAL_FIX_ZOOM, useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useMarketCatalogVouchers } from "#/features/home/hooks/use-market-catalog";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { MarketFilterSummary, useMarketFilterNotice } from "./market-filter-ui";
import { useMarketDistanceLabel, useMarketKindLabel } from "./market-labels";
import { EXPLICIT_CAMERA_RANK, type MarketCamera, type MarketViewport } from "./market-map";
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
  const [savedCamera, setSavedCamera] = useState<{
    scope: string;
    camera: MarketCamera;
  } | null>(null);
  const [viewport, setViewport] = useState<MarketViewport | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const camera =
    isAuthenticated && savedCamera?.scope === locationOwner ? savedCamera.camera : automaticCamera;

  const filter = useMarketFilter(useStorageOwner());
  const catalog = useMarketCatalogVouchers(filter, viewport, !filter.isRestoringPreference);
  const { vouchers, isCatalogComplete, error, retry } = catalog;

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

  const selectedVoucher = useMemo(
    () => vouchers.find((voucher) => voucher.id === selectedLocationId) ?? null,
    [vouchers, selectedLocationId],
  );

  const locationButtonLabel =
    locationStatus === "requesting"
      ? t`Finding location`
      : locationStatus === "denied"
        ? t`Location denied`
        : locationStatus === "unavailable"
          ? t`Location unavailable`
          : t`Use current location`;

  const handleSelectLocation = useCallback((id: string) => {
    setSelectedLocationId(id);
  }, []);

  const handleViewportSettled = useCallback((settled: MarketViewport) => {
    setViewport(settled);
  }, []);

  const handleGoToSavedLocation = useCallback(
    (coordinates: Coordinates) => {
      setSavedCamera({
        scope: locationOwner,
        camera: {
          ...coordinates,
          zoom: REAL_FIX_ZOOM,
          rank: EXPLICIT_CAMERA_RANK,
        },
      });
    },
    [locationOwner],
  );

  const handleRequestLocation = useCallback(() => {
    setSavedCamera(null);
    requestLocation();
  }, [requestLocation]);

  const notice = useMarketFilterNotice(filter, error, retry);

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
          locations={vouchers}
          selectedLocationId={selectedLocationId}
          camera={camera}
          fitBounds={fitBounds}
          cameraScope={locationOwner}
          userLocation={userLocation}
          onSelectLocation={handleSelectLocation}
          onViewportSettled={handleViewportSettled}
          className="absolute inset-0 h-full w-full"
        />
      </Suspense>

      <MarketAppMenu
        isAuthenticated={isAuthenticated}
        onGoToSavedLocation={handleGoToSavedLocation}
      />

      {selectedVoucher ? <MarketPreview voucher={selectedVoucher} realFix={realFix} /> : null}

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

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(var(--bottom-nav-offset),env(safe-area-inset-bottom))+1.25rem)] z-20 flex flex-col gap-2 px-4">
        <MarketFilterSummary filter={filter} />
        <div className="flex items-center gap-2">
          <Button asChild className="pointer-events-auto h-11 flex-1">
            <Link to="/" search={(previous) => ({ ...previous, tab: "market", view: "list" })}>
              <RiListUnordered className="me-2 size-4" aria-hidden="true" />
              <Trans>Browse all</Trans>
            </Link>
          </Button>
          <Button
            size="icon-lg"
            className="pointer-events-auto h-11 w-11 shrink-0 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
            aria-label={locationButtonLabel}
            disabled={
              locationStatus === "requesting" ||
              locationStatus === "denied" ||
              locationStatus === "unavailable"
            }
            onClick={handleRequestLocation}
          >
            <RiFocus3Line className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </main>
  );
}

function MarketPreview({
  voucher,
  realFix,
}: {
  voucher: MarketVoucher;
  realFix: Coordinates | null;
}) {
  const kindLabel = useMarketKindLabel(voucher.kind);
  const distanceLabel = useMarketDistanceLabel(realFix, voucher);
  const { data: detail } = useMarketVoucherDetail(voucher.address);
  const rate = formatVoucherRate(detail?.voucherValue ?? null, detail?.voucherUoa ?? null);

  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: voucher.address }}
      aria-label={voucher.name}
      className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+4.75rem)] z-20 flex items-center gap-3 border border-border bg-card px-4 py-3 text-start"
    >
      <VoucherAvatar
        address={voucher.address}
        symbol={voucher.symbol}
        iconUrl={detail?.iconUrl ?? null}
        size={40}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate font-heading font-semibold text-sm">
            {voucher.name}
          </span>
          <span className="shrink-0 font-medium font-mono text-[0.6875rem] text-muted-foreground">
            {voucher.symbol}
          </span>
        </span>
        {rate ? (
          <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-muted-foreground">
            <Trans>
              1 {voucher.symbol} = {rate.value} {rate.unit}
            </Trans>
          </span>
        ) : null}
        <span className="mt-1 flex items-center gap-2">
          <span className="inline-flex border border-border bg-background px-1.5 py-0.5 font-medium text-[0.6875rem] text-muted-foreground">
            {kindLabel}
          </span>
          {distanceLabel ? (
            <span className="truncate text-muted-foreground text-xs">{distanceLabel}</span>
          ) : voucher.locationName ? (
            <span className="truncate text-muted-foreground text-xs">{voucher.locationName}</span>
          ) : null}
        </span>
      </span>
      <RiArrowRightSLine
        className="rtl:-scale-x-100 size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}

function MarketAppMenu({
  isAuthenticated,
  onGoToSavedLocation,
}: {
  isAuthenticated: boolean;
  onGoToSavedLocation: (coordinates: Coordinates) => void;
}) {
  if (!isAuthenticated) {
    return <AppMenu className="absolute start-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30" />;
  }

  return <AuthenticatedMarketAppMenu onGoToSavedLocation={onGoToSavedLocation} />;
}

function AuthenticatedMarketAppMenu({
  onGoToSavedLocation,
}: {
  onGoToSavedLocation: (coordinates: Coordinates) => void;
}) {
  const profileQuery = useAuthProfile();
  const coordinates = profileCoordinates(profileQuery.data);

  let savedLocation: SavedLocationAction;
  if (profileQuery.isPending) {
    savedLocation = { status: "loading" };
  } else if (profileQuery.isError) {
    savedLocation = { status: "error" };
  } else if (coordinates) {
    savedLocation = {
      status: "available",
      onSelect: () => onGoToSavedLocation(coordinates),
    };
  } else {
    savedLocation = { status: "missing" };
  }

  return (
    <AppMenu
      className="absolute start-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30"
      savedLocation={savedLocation}
    />
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
