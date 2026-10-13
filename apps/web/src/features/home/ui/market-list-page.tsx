import { haversineMeters } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiArrowRightSLine } from "react-icons/ri";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { MarketplaceSearchShell } from "#/components/marketplace-search-shell";
import { useMarketDistanceLabel, useMarketKindLabel } from "#/components/vouchers/voucher-labels";
import { VoucherAvatar } from "#/components/wallet";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import type { MarketVoucher } from "@clc/api/features/market/client";
import { useMarketCatalogVouchers } from "#/features/home/hooks/use-market-catalog";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { MarketFilteredEmpty, MarketFilterFeedback, MarketFilterSheet } from "./market-filter-ui";

const MARKET_LIST_BATCH_SIZE = 20;

export function MarketListPage({
  onboardingBanner,
  locationOwner = GUEST_STORAGE_OWNER,
  creditableSearch,
}: {
  onboardingBanner?: ReactNode;
  locationOwner?: string;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
}) {
  const { t, i18n } = useLingui();
  const distanceOrigin = useDiscoveryDistanceOrigin(locationOwner);
  const navigate = useNavigate();
  const credit = useCreditableBrowse(creditableSearch);
  const filter = useMarketFilter(useStorageOwner(), creditableSearch !== undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Latched rather than tracking `filtersOpen`, so reopening the sheet reuses the cached vocabulary
  // instead of flashing an empty facet list on every open.
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const catalog = useMarketCatalogVouchers(
    filter,
    null,
    !filter.isRestoringPreference && !credit.blocksResults,
    filtersEverOpened,
    credit.enabled ? credit.poolRefs : undefined,
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
    if (!distanceOrigin) return vouchers;
    return vouchers
      .map((voucher) => ({
        voucher,
        distance: haversineMeters(distanceOrigin, voucher),
      }))
      .sort((left, right) => left.distance - right.distance)
      .map(({ voucher }) => voucher);
  }, [distanceOrigin, vouchers]);

  const visibleVouchers = sortedVouchers.slice(0, visibleCount);
  const hasMoreVisible = visibleCount < sortedVouchers.length;
  const canRenderCatalog =
    !credit.blocksResults &&
    (filter.isFiltered
      ? catalog.status !== "loading"
      : distanceOrigin === null || isCatalogComplete);

  const showLoading =
    !credit.blocksResults &&
    (filter.isFiltered
      ? catalog.status === "loading"
      : !isCatalogComplete && !error && (!canRenderCatalog || visibleVouchers.length === 0));

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
      <div>
        <h1 className="sr-only">
          <Trans>Vouchers</Trans>
        </h1>
        <MarketplaceSearchShell
          current="vouchers"
          className="sticky top-0 z-20 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
          search={<CatalogSearchField filter={filter} label={t`Search by name or symbol`} />}
          credit={
            <CreditableBrowseControl
              part="control"
              state={credit}
              onChange={(checked) =>
                void navigate({
                  to: "/market",
                  search: (previous) => ({ ...previous, creditable: checked }),
                })
              }
              onClear={() =>
                void navigate({
                  to: "/market",
                  replace: true,
                  search: (previous) => ({ ...previous, creditable: undefined }),
                })
              }
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

        {onboardingBanner ? <div className="mt-3">{onboardingBanner}</div> : null}

        <div className="mt-3">
          <CreditableBrowseControl
            part="feedback"
            state={credit}
            onChange={(checked) =>
              void navigate({
                to: ".",
                search: (previous) => ({ ...previous, creditable: checked }),
              })
            }
            onClear={() =>
              void navigate({
                to: ".",
                replace: true,
                search: (previous) => ({ ...previous, creditable: undefined }),
              })
            }
          />
        </div>

        <MarketFilterFeedback filter={filter} error={error} onRetry={retry} />

        {!credit.blocksResults &&
        !error &&
        (filter.isFiltered ? catalog.status !== "loading" : isCatalogComplete) ? (
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

        {credit.enabled && credit.poolRefs?.length === 0 ? (
          <div className="mt-4 border border-border bg-card p-4 text-muted-foreground text-sm">
            <Trans>No vouchers are available through your Credit pools.</Trans>
          </div>
        ) : showEmpty ? (
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
            aria-label={t`Vouchers list`}
          >
            {visibleVouchers.map((voucher, index) => (
              <MarketVoucherRow
                key={voucher.id}
                voucher={voucher}
                realFix={distanceOrigin}
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
      search={{ from: "market" }}
      className={[
        "flex min-h-16 w-full items-center gap-3 p-3 text-start active:bg-muted",
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
      <RiArrowRightSLine
        className="rtl:-scale-x-100 size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
