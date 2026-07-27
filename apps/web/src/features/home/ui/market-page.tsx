import { Trans, useLingui } from "@lingui/react/macro";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import { Link } from "@tanstack/react-router";
import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { RiArrowRightSLine, RiFocus3Line, RiListUnordered } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { VoucherAvatar } from "#/components/wallet";
import { GUEST_LOCATION_OWNER } from "#/features/home/api/last-location-storage";
import type { MarketVoucher } from "#/features/home/api/market-client";
import { useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useMarketMapVouchers } from "#/features/home/hooks/use-market-vouchers";
import { useMarketDistanceLabel, useMarketKindLabel } from "./market-labels";
import type { MarketViewport } from "./market-map";
import { MarketMap } from "./market-map.lazy";

type Coordinates = { lat: number; lng: number };

export function MarketPage({
  onboardingBanner,
  locationOwner = GUEST_LOCATION_OWNER,
}: {
  onboardingBanner?: ReactNode;
  /**
   * Scope for the persisted GPS fix. Defaults to guest so a caller that forgets
   * to pass it fails closed rather than sharing a precise location.
   */
  locationOwner?: string;
}) {
  const { t } = useLingui();
  const { camera, realFix, userLocation, locationStatus, requestLocation } =
    useMarketCamera(locationOwner);
  const [viewport, setViewport] = useState<MarketViewport | null>(null);
  // Start with nothing selected: the newest catalog row may be anywhere in the
  // world and must not pull the resolved camera to an arbitrary location.
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const { vouchers, isCatalogComplete, error, retry } = useMarketMapVouchers(viewport);

  // Derived, never mirrored: a refreshed dataset that no longer contains the
  // selection simply stops matching, so the preview closes on its own.
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

  const isEmpty = isCatalogComplete && vouchers.length === 0;

  return (
    <main className="relative h-[100svh] overflow-hidden bg-card">
      {/* The basemap is never unmounted for loading, error, or empty states. */}
      <Suspense
        fallback={<div className="market-map-fallback absolute inset-0 h-full w-full bg-card" />}
      >
        <MarketMap
          locations={vouchers}
          selectedLocationId={selectedLocationId}
          camera={camera}
          cameraScope={locationOwner}
          userLocation={userLocation}
          onSelectLocation={handleSelectLocation}
          onViewportSettled={handleViewportSettled}
          className="absolute inset-0 h-full w-full"
        />
      </Suspense>

      {onboardingBanner}

      {selectedVoucher ? (
        <MarketPreview
          voucher={selectedVoucher}
          realFix={realFix}
          offsetForBanner={!!onboardingBanner}
        />
      ) : null}

      {error ? (
        <div
          className={[
            "absolute inset-x-4 z-20 flex items-center justify-between gap-3 border border-border bg-card px-4 py-3",
            onboardingBanner
              ? "top-[calc(env(safe-area-inset-top)+3rem)]"
              : "top-[calc(env(safe-area-inset-top)+1rem)]",
          ].join(" ")}
        >
          <span className="min-w-0 text-sm">
            <Trans>Could not load vouchers.</Trans>
          </span>
          <Button size="sm" variant="outline" className="bg-card" onClick={retry}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {isEmpty && !error ? (
        <div
          className={[
            "absolute inset-x-4 z-20 border border-border bg-card px-4 py-3 text-center text-muted-foreground text-sm",
            onboardingBanner
              ? "top-[calc(env(safe-area-inset-top)+3rem)]"
              : "top-[calc(env(safe-area-inset-top)+1rem)]",
          ].join(" ")}
        >
          <Trans>No vouchers to show yet.</Trans>
        </div>
      ) : null}

      <div className="absolute right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex">
        <Button
          size="icon-lg"
          className="h-11 w-11 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
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
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-6">
        <Button asChild className="pointer-events-auto h-11 px-5">
          <Link to="/" search={{ tab: "market", view: "list" }}>
            <RiListUnordered className="mr-2 size-4" aria-hidden="true" />
            <Trans>Browse all</Trans>
          </Link>
        </Button>
      </div>
    </main>
  );
}

/**
 * The selected voucher, and the way into its page.
 *
 * Renders immediately from the catalog row the map already holds, then fills in
 * the profile image and rate from the per-voucher detail query. That query is
 * keyed exactly as the voucher page keys it, so selecting a marker warms the
 * cache the page reads and navigation arrives with no loading state.
 */
function MarketPreview({
  voucher,
  realFix,
  offsetForBanner,
}: {
  voucher: MarketVoucher;
  realFix: Coordinates | null;
  offsetForBanner: boolean;
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
      className={[
        "absolute inset-x-4 z-20 flex items-center gap-3 border border-border bg-card px-4 py-3 text-left",
        offsetForBanner
          ? "top-[calc(env(safe-area-inset-top)+3rem)]"
          : "top-[calc(env(safe-area-inset-top)+1rem)]",
      ].join(" ")}
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
        {/* Only rendered once detail resolves: an empty rate line would reserve
            space for a claim the app cannot yet make. */}
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
      <RiArrowRightSLine className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
