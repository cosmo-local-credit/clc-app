import { haversineMeters } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiArrowRightSLine, RiMap2Line } from "react-icons/ri";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { VoucherAvatar } from "#/components/wallet";
import { GUEST_LOCATION_OWNER } from "#/features/home/api/last-location-storage";
import type { MarketVoucher } from "@clc/api/features/market/client";
import { useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { useMarketCatalogVouchers } from "#/features/home/hooks/use-market-catalog";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { MarketFilteredEmpty, MarketFilterFeedback, MarketFilterSheet } from "./market-filter-ui";
import { useMarketDistanceLabel, useMarketKindLabel } from "./market-labels";

const MARKET_LIST_BATCH_SIZE = 20;

export function MarketListPage({
  onboardingBanner,
  locationOwner = GUEST_LOCATION_OWNER,
}: {
  onboardingBanner?: ReactNode;
  locationOwner?: string;
}) {
  const { t, i18n } = useLingui();
  const { realFix } = useMarketCamera(locationOwner);
  const filter = useMarketFilter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Latched rather than tracking `filtersOpen`, so reopening the sheet reuses the cached vocabulary
  // instead of flashing an empty facet list on every open.
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const catalog = useMarketCatalogVouchers(
    filter,
    null,
    !filter.isRestoringPreference,
    filtersEverOpened,
  );
  const { vouchers, isCatalogComplete, error, retry } = catalog;
  const [visibleCount, setVisibleCount] = useState(MARKET_LIST_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const filterKey = catalog.filterKey;
  const previousFilterKey = useRef(filterKey);
  if (previousFilterKey.current !== filterKey) {
    previousFilterKey.current = filterKey;
    setVisibleCount(MARKET_LIST_BATCH_SIZE);
  }

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
  const canRenderCatalog = filter.isFiltered
    ? catalog.status !== "loading"
    : realFix === null || isCatalogComplete;

  const showLoading = filter.isFiltered
    ? catalog.status === "loading"
    : !isCatalogComplete && !error && (!canRenderCatalog || visibleVouchers.length === 0);

  const isRefining = catalog.status === "refining" || filter.isDebouncing;

  const showEmpty =
    sortedVouchers.length === 0 &&
    !error &&
    filter.result.ok &&
    (filter.isFiltered ? catalog.status === "ready" : isCatalogComplete);

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

  const resultCountLabel = i18n._("{count, plural, one {# voucher} other {# vouchers}}", {
    count: sortedVouchers.length,
  });

  return (
    <main className="relative min-h-[100svh] bg-background px-4 pb-[calc(max(var(--bottom-nav-offset),env(safe-area-inset-bottom))+2rem)]">
      {onboardingBanner}
      <div
        className={
          onboardingBanner
            ? "pt-[calc(env(safe-area-inset-top)+4.25rem)]"
            : "pt-[calc(env(safe-area-inset-top)+1rem)]"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Marketplace</Trans>
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <MarketFilterSheet
              filter={filter}
              facets={catalog.tagFacets}
              open={filtersOpen}
              onOpenChange={(next) => {
                if (next) setFiltersEverOpened(true);
                setFiltersOpen(next);
              }}
            />
            <Button
              asChild
              variant="outline"
              size="icon-lg"
              className="relative h-9 w-9 bg-card before:absolute before:-inset-1 before:content-['']"
            >
              <Link
                to="/"
                search={(previous) => ({ ...previous, tab: "market", view: "map" })}
                aria-label={t`Map`}
              >
                <RiMap2Line className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <CatalogSearchField filter={filter} label={t`Search by name or symbol`} />
        </div>

        <MarketFilterFeedback filter={filter} error={error} onRetry={retry} />

        {!error && (filter.isFiltered ? catalog.status !== "loading" : isCatalogComplete) ? (
          <p
            className="mt-4 font-medium text-sm tabular-nums"
            aria-live={filter.isFiltered ? "polite" : undefined}
          >
            {resultCountLabel}
          </p>
        ) : null}

        {showLoading ? (
          <div className="mt-4 border border-border bg-card p-4 text-muted-foreground text-sm">
            <Trans>Loading marketplace…</Trans>
          </div>
        ) : null}

        {showEmpty ? (
          filter.isFiltered ? (
            <MarketFilteredEmpty onClear={filter.clear} />
          ) : (
            <div className="mt-4 border border-border bg-card p-4 text-muted-foreground text-sm">
              <Trans>No vouchers to show yet.</Trans>
            </div>
          )
        ) : null}

        {canRenderCatalog && visibleVouchers.length > 0 ? (
          <section
            className={[
              "mt-3 overflow-hidden border border-border bg-card",
              isRefining ? "opacity-60 transition-opacity" : "",
            ].join(" ")}
            aria-busy={isRefining}
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
