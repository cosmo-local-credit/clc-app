import { haversineMeters } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiArrowRightSLine, RiFocus3Line, RiMap2Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { VoucherAvatar } from "#/components/wallet";
import { GUEST_LOCATION_OWNER } from "#/features/home/api/last-location-storage";
import type { MarketVoucher } from "#/features/home/api/market-client";
import { useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { useMarketMapVouchers } from "#/features/home/hooks/use-market-vouchers";
import { useMarketDistanceLabel, useMarketKindLabel } from "./market-labels";

const MARKET_LIST_BATCH_SIZE = 20;

export function MarketListPage({
  onboardingBanner,
  locationOwner = GUEST_LOCATION_OWNER,
}: {
  onboardingBanner?: ReactNode;
  locationOwner?: string;
}) {
  const { t } = useLingui();
  const { realFix, locationStatus, requestLocation } = useMarketCamera(locationOwner);
  const { vouchers, isCatalogComplete, error, retry } = useMarketMapVouchers(null);
  const [visibleCount, setVisibleCount] = useState(MARKET_LIST_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const sortedVouchers = useMemo(() => {
    if (!realFix) return vouchers;
    return vouchers
      .map((voucher) => ({
        voucher,
        distance: haversineMeters(realFix, voucher),
      }))
      .sort((left, right) => left.distance - right.distance)
      .map(({ voucher }) => voucher);
  }, [realFix, vouchers]);

  const visibleVouchers = sortedVouchers.slice(0, visibleCount);
  const hasMoreVisible = visibleCount < sortedVouchers.length;
  const canRenderCatalog = realFix === null || isCatalogComplete;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !canRenderCatalog ||
      !hasMoreVisible ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((count) => Math.min(count + MARKET_LIST_BATCH_SIZE, sortedVouchers.length));
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [canRenderCatalog, hasMoreVisible, sortedVouchers.length]);

  const locationButtonLabel =
    locationStatus === "requesting"
      ? t`Finding location`
      : locationStatus === "denied"
        ? t`Location denied`
        : locationStatus === "unavailable"
          ? t`Location unavailable`
          : t`Use current location`;

  return (
    <main className="relative min-h-[100svh] bg-background px-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {onboardingBanner}
      <div
        className={
          onboardingBanner
            ? "pt-[calc(env(safe-area-inset-top)+4.25rem)]"
            : "pt-[calc(env(safe-area-inset-top)+1rem)]"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
              <Trans>Marketplace</Trans>
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {realFix ? (
                <Trans>Vouchers ordered by approximate distance.</Trans>
              ) : (
                <Trans>Explore community vouchers.</Trans>
              )}
            </p>
          </div>
          <Button asChild variant="outline" className="h-11 bg-card px-3">
            <Link to="/" search={{ tab: "market", view: "map" }}>
              <RiMap2Line className="size-4" aria-hidden="true" />
              <Trans>Map</Trans>
            </Link>
          </Button>
        </div>

        {!realFix ? (
          <Button
            variant="outline"
            className="mt-4 h-11 w-full bg-card"
            disabled={
              locationStatus === "requesting" ||
              locationStatus === "denied" ||
              locationStatus === "unavailable"
            }
            onClick={requestLocation}
          >
            <RiFocus3Line className="size-4" aria-hidden="true" />
            {locationButtonLabel}
          </Button>
        ) : null}

        {!isCatalogComplete && !error && (!canRenderCatalog || visibleVouchers.length === 0) ? (
          <div className="mt-4 border border-border bg-card p-4 text-muted-foreground text-sm">
            <Trans>Loading marketplace…</Trans>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 space-y-3 border border-border bg-card p-4">
            <p className="text-muted-foreground text-sm">
              <Trans>Could not load vouchers.</Trans>
            </p>
            <Button variant="outline" size="sm" className="h-9 bg-card" onClick={retry}>
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : null}

        {isCatalogComplete && !error && sortedVouchers.length === 0 ? (
          <div className="mt-4 border border-border bg-card p-4 text-muted-foreground text-sm">
            <Trans>No vouchers to show yet.</Trans>
          </div>
        ) : null}

        {canRenderCatalog && visibleVouchers.length > 0 ? (
          <section
            className="mt-4 border border-border bg-card"
            aria-label={t`Marketplace vouchers`}
          >
            {visibleVouchers.map((voucher, index) => (
              <MarketVoucherRow
                key={voucher.id}
                voucher={voucher}
                realFix={realFix}
                isLast={!hasMoreVisible && index === visibleVouchers.length - 1}
              />
            ))}
            <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
            {hasMoreVisible ? (
              <p className="p-3 text-center text-muted-foreground text-xs">
                <Trans>Scroll for more</Trans>
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function MarketVoucherRow({
  voucher,
  realFix,
  isLast,
}: {
  voucher: MarketVoucher;
  realFix: { lat: number; lng: number } | null;
  isLast: boolean;
}) {
  const kindLabel = useMarketKindLabel(voucher.kind);
  const distanceLabel = useMarketDistanceLabel(realFix, voucher);

  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: voucher.address }}
      className={[
        "flex min-h-16 items-center gap-3 p-3 active:bg-muted",
        isLast ? "" : "border-b border-border",
      ].join(" ")}
    >
      <VoucherAvatar
        address={voucher.address}
        symbol={voucher.symbol}
        iconUrl={voucher.iconUrl}
        size={44}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-heading text-sm font-semibold">{voucher.name}</span>
          <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
            {voucher.symbol}
          </span>
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          <span className="shrink-0 border border-border bg-background px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
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
