import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RiAddLine, RiArrowRightSLine } from "react-icons/ri";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { BackChevron, PoolLogo } from "#/components/wallet";
import type { UserPool } from "@clc/api/features/pools/client";
import { useCreditablePools } from "#/features/pools/hooks/use-creditable-pools";
import { usePoolCatalog, usePoolFacetVocabulary } from "#/features/pools/hooks/use-filtered-pools";
import { usePoolOutputAvailability } from "#/features/pools/hooks/use-pool-output-availability";
import { useUserPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { CHAIN_ID } from "#/lib/chain";
import { parsePoolCreditable, parsePoolOutputVoucher } from "#/lib/navigation/pool-search";
import { resetPoolCreateHistory } from "#/lib/navigation/pool-create-history";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { TagBadge } from "#/components/ui/tag-badge";
import { MarketplaceResourceNavigation } from "#/components/marketplace-resource-navigation";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { PoolFilterFeedback, PoolFilterSheet } from "./pool-filter-ui";
import { PoolOutputVoucherFilter } from "./pool-output-voucher-filter";

const POOL_ROW_TAG_LIMIT = 3;

type CreditChoice = {
  holder: string;
  context: string;
  mode: "auto" | "on" | "off" | "invalid";
  initialized: boolean;
  checked: boolean;
  touched: boolean;
};

export function PoolsPage({
  creditableSearch,
  outputVoucherSearch,
}: {
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  outputVoucherSearch?: string | readonly string[];
}) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const auth = useAuthStatus();
  const address = auth.isAuthenticated ? auth.address : undefined;
  const storageOwner = useStorageOwner();
  const distanceOrigin = useDiscoveryDistanceOrigin(storageOwner ?? GUEST_STORAGE_OWNER);
  const outputVoucherResult = parsePoolOutputVoucher(outputVoucherSearch);
  const outputVoucherAddress = outputVoucherResult.ok ? outputVoucherResult.address : null;
  const outputFilterActive = outputVoucherAddress !== null;
  const outputFilterInvalid = !outputVoucherResult.ok;
  const creditableResult = parsePoolCreditable(creditableSearch);
  const creditFilterInvalid = !creditableResult.ok;
  const creditMode = creditFilterInvalid
    ? "invalid"
    : creditableResult.enabled === null
      ? "auto"
      : creditableResult.enabled
        ? "on"
        : "off";
  const specialFilterInvalid = outputFilterInvalid || creditFilterInvalid;
  const filter = usePersistedCatalogFilter(CATALOG_FILTER_PREFERENCE_NAMES.pools, storageOwner, {
    voucherRelationships: true,
    externalFilterActive: outputVoucherSearch !== undefined || creditableSearch !== undefined,
  });
  const poolsQuery = useUserPoolsInfinite(
    undefined,
    !filter.isFiltered && !filter.isRestoringPreference,
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Latched rather than tracking `filtersOpen`, so reopening the sheet reuses the cached vocabulary
  // instead of flashing an empty facet list on every open.
  const [filtersEverOpened, setFiltersEverOpened] = useState(false);
  const clearCreateDraft = usePoolCreateDraft((state) => state.clearDraft);

  const catalog = usePoolCatalog(
    filter,
    {
      pools: poolsQuery.data?.pages.flatMap((page) => page.pools) ?? [],
      isPending: poolsQuery.isPending,
      error: poolsQuery.error ?? null,
      retry: () => void poolsQuery.refetch(),
      hasNextPage: poolsQuery.hasNextPage,
      fetchNextPage: () => void poolsQuery.fetchNextPage(),
      isFetchingNextPage: poolsQuery.isFetchingNextPage,
    },
    filtersEverOpened,
  );
  const creditable = useCreditablePools(address);
  const outputAvailability = usePoolOutputAvailability(
    outputVoucherAddress ? { chainId: CHAIN_ID, address: outputVoucherAddress } : undefined,
  );
  const voucherVocabulary = usePoolFacetVocabulary(true);
  const selectedVoucherDetail = useMarketVoucherDetail(outputVoucherAddress ?? undefined);
  const creditableAddresses = useMemo(
    () => new Set(creditable.pools.map((pool) => pool.address.toLowerCase())),
    [creditable.pools],
  );
  const filteredCreditablePools = useMemo(
    () =>
      filter.isFiltered
        ? catalog.pools.filter((pool) => creditableAddresses.has(pool.address.toLowerCase()))
        : creditable.pools,
    [catalog.pools, creditable.pools, creditableAddresses, filter.isFiltered],
  );
  const outputAddresses = useMemo(
    () => new Set(outputAvailability.pools.map((pool) => pool.address.toLowerCase())),
    [outputAvailability.pools],
  );
  const creditableOutputPools = useMemo(
    () =>
      outputAvailability.pools.filter((pool) =>
        creditableAddresses.has(pool.address.toLowerCase()),
      ),
    [creditableAddresses, outputAvailability.pools],
  );
  const specialPools = outputFilterActive ? creditableOutputPools : filteredCreditablePools;
  const creditDefaultPools = outputFilterActive
    ? filter.isFiltered
      ? catalog.pools.filter(
          (pool) =>
            outputAddresses.has(pool.address.toLowerCase()) &&
            creditableAddresses.has(pool.address.toLowerCase()),
        )
      : creditableOutputPools
    : filteredCreditablePools;
  const holderKey = address?.toLowerCase() ?? "";
  const creditContext = outputVoucherAddress ?? (outputFilterInvalid ? "invalid" : "all");
  const [creditChoice, setCreditChoice] = useState<CreditChoice | null>(null);
  const creditReadyForDefault =
    holderKey !== "" &&
    creditable.status === "ready" &&
    (!outputFilterActive || outputAvailability.status === "ready") &&
    !outputFilterInvalid &&
    catalog.status === "ready" &&
    !filter.isRestoringPreference &&
    filter.result.ok;
  const creditChecked =
    creditMode === "on"
      ? creditReadyForDefault
      : creditMode === "off" || creditMode === "invalid"
        ? false
        : Boolean(
            creditChoice?.holder === holderKey &&
            creditChoice.mode === "auto" &&
            creditChoice.checked &&
            (creditChoice.touched || creditChoice.context === creditContext),
          );
  const specialFilterActive = creditChecked || outputFilterActive;
  const selectedSpecialPools = outputFilterActive
    ? creditChecked
      ? creditableOutputPools
      : outputAvailability.pools
    : specialPools;
  const selectedSpecialAddresses = useMemo(
    () => new Set(selectedSpecialPools.map((pool) => pool.address.toLowerCase())),
    [selectedSpecialPools],
  );
  const pools = specialFilterInvalid
    ? []
    : specialFilterActive
      ? filter.isFiltered
        ? catalog.pools.filter((pool) => selectedSpecialAddresses.has(pool.address.toLowerCase()))
        : selectedSpecialPools
      : catalog.pools;
  const hasMore = !specialFilterActive && !specialFilterInvalid && catalog.hasMore;
  const isRefining =
    catalog.status === "refining" ||
    filter.isDebouncing ||
    (outputFilterActive && outputAvailability.isRefreshing);
  const outputReady = !outputFilterActive || outputAvailability.status === "ready";
  const canShowResults =
    catalog.status === "ready" && filter.result.ok && !specialFilterInvalid && outputReady;
  const resultCountLabel = i18n._("{count, plural, one {# pool} other {# pools}}", {
    count: pools.length,
  });

  useEffect(() => {
    resetPoolCreateHistory();
    clearCreateDraft();
  }, [clearCreateDraft]);

  useEffect(() => {
    setCreditChoice((current) => {
      if (holderKey === "") return null;
      if (current?.holder !== holderKey || current.mode !== creditMode) {
        if (creditMode !== "auto") {
          return {
            holder: holderKey,
            context: creditContext,
            mode: creditMode,
            initialized: creditReadyForDefault,
            checked: creditMode === "on" && creditReadyForDefault,
            touched: false,
          };
        }
        return {
          holder: holderKey,
          context: creditContext,
          mode: "auto",
          initialized: creditReadyForDefault,
          checked: creditReadyForDefault && creditDefaultPools.length > 0,
          touched: false,
        };
      }
      if (creditMode !== "auto") return current;
      if (!current.touched && current.context !== creditContext) {
        return {
          holder: holderKey,
          context: creditContext,
          mode: "auto",
          initialized: creditReadyForDefault,
          checked: creditReadyForDefault && creditDefaultPools.length > 0,
          touched: false,
        };
      }
      if (!current.initialized && creditReadyForDefault) {
        return {
          holder: holderKey,
          context: creditContext,
          mode: "auto",
          initialized: true,
          checked: creditDefaultPools.length > 0,
          touched: false,
        };
      }
      return current;
    });
  }, [creditContext, creditDefaultPools.length, creditMode, creditReadyForDefault, holderKey]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && !catalog.isLoadingMore) {
        catalog.loadMore();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [catalog.isLoadingMore, catalog.loadMore, hasMore]);

  return (
    <div className="space-y-4">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Pools</Trans>
        </h1>
        <div className="flex items-center gap-1.5">
          {auth.isAuthenticated ? (
            <Button asChild variant="outline" className="bg-card">
              <Link to="/pools/create/$step" params={{ step: "pool" }}>
                <RiAddLine className="size-4" aria-hidden="true" />
                <Trans>Create</Trans>
              </Link>
            </Button>
          ) : null}
          <PoolFilterSheet
            filter={filter}
            facets={catalog.tagFacets}
            voucherFacets={catalog.voucherFacets}
            open={filtersOpen}
            onOpenChange={(next) => {
              if (next) setFiltersEverOpened(true);
              setFiltersOpen(next);
            }}
          />
        </div>
      </div>

      <MarketplaceResourceNavigation current="pools" />

      <CatalogSearchField filter={filter} label={t`Search pools`} />

      <PoolFilterFeedback filter={filter} error={catalog.error} onRetry={catalog.retry} />

      {outputFilterInvalid ? (
        <div
          className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
          role="alert"
        >
          <p className="text-sm">
            <Trans>This link contains an invalid output voucher.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 bg-card"
            onClick={() =>
              void navigate({
                to: ".",
                replace: true,
                search: (previous) => ({ ...previous, out_voucher: undefined }),
              })
            }
          >
            <Trans>Clear filter</Trans>
          </Button>
        </div>
      ) : null}

      {creditFilterInvalid ? (
        <div
          className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
          role="alert"
        >
          <p className="text-sm">
            <Trans>This link contains an invalid Credit filter.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 bg-card"
            onClick={() =>
              void navigate({
                to: ".",
                replace: true,
                search: (previous) => ({ ...previous, creditable: undefined }),
              })
            }
          >
            <Trans>Clear filter</Trans>
          </Button>
        </div>
      ) : null}

      {outputFilterActive && outputAvailability.status === "error" ? (
        <div
          className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
          role="alert"
        >
          <p className="text-sm">
            <Trans>Couldn't check voucher availability.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 bg-card"
            onClick={outputAvailability.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {creditable.status === "error" ? (
        <div
          className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
          role="alert"
        >
          <p className="text-sm">
            <Trans>Couldn't check creditable pools.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 bg-card"
            onClick={creditable.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {(creditable.status === "ready" && creditable.hasVerificationGaps) ||
      (outputFilterActive &&
        outputAvailability.status === "ready" &&
        outputAvailability.hasVerificationGaps) ? (
        <div
          className="border border-border bg-card p-3 text-muted-foreground text-sm"
          role="status"
        >
          <Trans>Some pools couldn't be checked. Showing verified results.</Trans>
        </div>
      ) : null}

      {catalog.status === "loading" ? (
        <div className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>Loading pools…</Trans>
        </div>
      ) : null}

      {outputFilterActive && outputAvailability.status === "loading" ? (
        <div className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>Checking voucher availability…</Trans>
        </div>
      ) : null}

      {catalog.status === "ready" && filter.result.ok ? (
        <>
          <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
            <p className="shrink-0 font-medium text-sm tabular-nums">{resultCountLabel}</p>
            {auth.isAuthenticated ? (
              <label
                htmlFor="creditable-pools"
                className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id="creditable-pools"
                  checked={creditChecked}
                  disabled={
                    specialFilterInvalid ||
                    creditable.status !== "ready" ||
                    (outputFilterActive && outputAvailability.status !== "ready")
                  }
                  onCheckedChange={(checked) => {
                    setCreditChoice({
                      holder: holderKey,
                      context: creditContext,
                      mode: creditMode,
                      initialized: true,
                      checked,
                      touched: true,
                    });
                    void navigate({
                      to: ".",
                      search: (previous) => ({
                        ...previous,
                        creditable: checked,
                      }),
                    });
                  }}
                />
                <span>
                  <Trans>Credit</Trans>
                </span>
                {creditable.status === "loading" ? (
                  <span className="text-muted-foreground text-xs">
                    <Trans>Checking…</Trans>
                  </span>
                ) : null}
                {creditable.isRefreshing ? (
                  <span className="sr-only">
                    <Trans>Refreshing creditable pools…</Trans>
                  </span>
                ) : null}
              </label>
            ) : null}
            <PoolOutputVoucherFilter
              facets={voucherVocabulary.data?.voucherFacets ?? []}
              value={outputVoucherAddress}
              fallbackLabel={selectedVoucherDetail.data?.name}
              loading={voucherVocabulary.isPending}
              onValueChange={(next) =>
                void navigate({
                  to: ".",
                  search: (previous) => ({
                    ...previous,
                    out_voucher: next ?? undefined,
                  }),
                })
              }
            />
          </div>
          {voucherVocabulary.isError ? (
            <div
              className="flex items-center justify-between gap-3 border border-border bg-card p-3"
              role="alert"
            >
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load voucher choices.</Trans>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 bg-card"
                onClick={() => void voucherVocabulary.refetch()}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : null}
          {canShowResults && pools.length === 0 ? (
            <div className="space-y-3 border border-border bg-card p-3">
              <p className="text-muted-foreground text-sm">
                {creditChecked && outputFilterActive && filter.isFiltered ? (
                  <Trans>No creditable pools with this voucher match these filters.</Trans>
                ) : creditChecked && outputFilterActive ? (
                  <Trans>No creditable pools have this voucher available.</Trans>
                ) : outputFilterActive && filter.isFiltered ? (
                  <Trans>No pools with this voucher match these filters.</Trans>
                ) : outputFilterActive ? (
                  <Trans>No pools have this voucher available.</Trans>
                ) : creditChecked && filter.isFiltered ? (
                  <Trans>No creditable pools match this search.</Trans>
                ) : creditChecked ? (
                  <Trans>No creditable pools are available.</Trans>
                ) : filter.isFiltered ? (
                  <Trans>No pools match this search.</Trans>
                ) : (
                  <Trans>No pools yet.</Trans>
                )}
              </p>
              {filter.isFiltered ? (
                <Button variant="outline" size="sm" className="h-9 bg-card" onClick={filter.clear}>
                  <Trans>Clear filters</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {canShowResults && pools.length > 0 ? (
        <section
          className={[
            "border border-border bg-card",
            isRefining ? "opacity-60 transition-opacity" : "",
          ].join(" ")}
          aria-busy={isRefining}
          aria-label={t`Pools list`}
        >
          {pools.map((pool, index) => (
            <PoolRow
              key={pool.address}
              pool={pool}
              isLast={index === pools.length - 1}
              distanceOrigin={distanceOrigin}
            />
          ))}
          <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
          {catalog.isLoadingMore ? (
            <div className="p-3 text-center text-muted-foreground text-xs">
              <Trans>Loading more…</Trans>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PoolRow({
  pool,
  isLast,
  distanceOrigin,
}: {
  pool: UserPool;
  isLast: boolean;
  distanceOrigin: { lat: number; lng: number } | null | undefined;
}) {
  const { i18n } = useLingui();
  const distanceMeters =
    distanceOrigin && pool.geoLat !== null && pool.geoLng !== null
      ? haversineMeters(distanceOrigin, { lat: pool.geoLat, lng: pool.geoLng })
      : null;
  const distance = distanceMeters === null ? null : formatDistance(distanceMeters);
  const distanceLabel = distance
    ? `${new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale, {
        minimumFractionDigits: distance.fractionDigits,
        maximumFractionDigits: distance.fractionDigits,
      }).format(distance.value)} ${distance.unit}`
    : null;
  return (
    <Link
      to="/pools/$poolAddress"
      params={{ poolAddress: pool.address }}
      className={[
        "flex w-full items-center gap-3 p-3 text-start active:bg-muted",
        isLast ? "" : "border-b border-border",
      ].join(" ")}
    >
      <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={42} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-bold text-sm tracking-tight">{pool.name}</p>
        <p className="mt-1 text-primary text-[0.6875rem] font-semibold">
          {pool.voucherCount === 1 ? (
            <Trans>1 voucher</Trans>
          ) : (
            <Trans>{pool.voucherCount} vouchers</Trans>
          )}
        </p>
        {pool.locationName || distanceLabel ? (
          <p className="mt-1 truncate text-[0.6875rem] text-muted-foreground">
            {[pool.locationName, distanceLabel].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {pool.tags.length > 0 ? (
          <span className="mt-1.5 flex gap-1 overflow-hidden">
            {pool.tags.slice(0, POOL_ROW_TAG_LIMIT).map((tag) => (
              <TagBadge key={tag} tag={tag} className="h-5 shrink-0 px-1.5 text-[10px]" />
            ))}
            {pool.tags.length > POOL_ROW_TAG_LIMIT ? (
              <span className="shrink-0 self-center text-muted-foreground text-[10px]">
                +{pool.tags.length - POOL_ROW_TAG_LIMIT}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <RiArrowRightSLine
        className="rtl:-scale-x-100 size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
