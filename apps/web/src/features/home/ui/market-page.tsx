import { Trans, useLingui } from "@lingui/react/macro";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { RiFocus3Line, RiListUnordered, RiMapPinLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import type { MarketVoucher } from "#/features/home/api/market-client";
import { useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { useMarketMapVouchers } from "#/features/home/hooks/use-market-vouchers";
import type { MarketLocationKind } from "./market-data";
import type { MarketViewport } from "./market-map";
import { MarketMap } from "./market-map.lazy";

type Coordinates = { lat: number; lng: number };

export function MarketPage({ onboardingBanner }: { onboardingBanner?: ReactNode }) {
  const { t } = useLingui();
  const { camera, realFix, userLocation, locationStatus, requestLocation } = useMarketCamera();
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
        <Button className="pointer-events-auto h-11 px-5">
          <RiListUnordered className="mr-2 size-4" aria-hidden="true" />
          <Trans>Browse all</Trans>
        </Button>
      </div>
    </main>
  );
}

function useKindLabel(kind: MarketLocationKind): string {
  const { t } = useLingui();
  switch (kind) {
    case "goods":
      return t`Goods`;
    case "services":
      return t`Services`;
    case "voucher":
      return t`Voucher`;
  }
}

/**
 * Distance is only ever shown for a real GPS fix (camera rank 1 or 2). The
 * complete unit-bearing message goes through Lingui so Serbian and Swahili can
 * reorder value and unit; a translated unit fragment is never concatenated.
 */
function useDistanceLabel(from: Coordinates | null, to: Coordinates): string | null {
  const { t } = useLingui();
  if (!from) return null;

  try {
    const distance = formatDistance(haversineMeters(from, to));
    return distance.unit === "m"
      ? t`${distance.value} m`
      : t`${distance.value.toFixed(distance.fractionDigits)} km`;
  } catch {
    // A catalog row with impossible coordinates must not break the preview.
    return null;
  }
}

function MarketPreview({
  voucher,
  realFix,
  offsetForBanner,
}: {
  voucher: MarketVoucher;
  realFix: Coordinates | null;
  offsetForBanner: boolean;
}) {
  const kindLabel = useKindLabel(voucher.kind);
  const distanceLabel = useDistanceLabel(realFix, voucher);

  return (
    // Not a button: there is no voucher-detail destination yet, and an inert
    // focusable control announced as actionable is worse than plain text.
    <section
      aria-label={voucher.name}
      className={[
        "absolute inset-x-4 z-20 flex items-center gap-3 border border-border bg-card px-4 py-3 text-left",
        offsetForBanner
          ? "top-[calc(env(safe-area-inset-top)+3rem)]"
          : "top-[calc(env(safe-area-inset-top)+1rem)]",
      ].join(" ")}
    >
      <RiMapPinLine className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-heading font-semibold text-sm">{voucher.name}</span>
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
    </section>
  );
}
