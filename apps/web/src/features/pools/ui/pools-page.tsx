import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RiAddLine, RiArrowRightSLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { BackChevron, PoolLogo } from "#/components/wallet";
import type { UserPool } from "@clc/api/features/pools/client";
import { useCreditablePools } from "#/features/pools/hooks/use-creditable-pools";
import { usePoolCatalog } from "#/features/pools/hooks/use-filtered-pools";
import { useUserPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { resetPoolCreateHistory } from "#/lib/navigation/pool-create-history";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { TagBadge } from "#/components/ui/tag-badge";
import { PoolFilterFeedback, PoolFilterSheet } from "./pool-filter-ui";

const POOL_ROW_TAG_LIMIT = 3;

type CreditChoice = {
  holder: string;
  initialized: boolean;
  checked: boolean;
};

export function PoolsPage() {
  const { t, i18n } = useLingui();
  const { address } = useConnection();
  const filter = usePersistedCatalogFilter(
    CATALOG_FILTER_PREFERENCE_NAMES.pools,
    useStorageOwner(),
    { voucherRelationships: true },
  );
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
  const holderKey = address?.toLowerCase() ?? "";
  const [creditChoice, setCreditChoice] = useState<CreditChoice | null>(null);
  const creditReadyForDefault =
    holderKey !== "" &&
    creditable.status === "ready" &&
    catalog.status === "ready" &&
    !filter.isRestoringPreference &&
    filter.result.ok;
  const creditChecked = creditChoice?.holder === holderKey && creditChoice.checked;
  const pools = creditChecked ? filteredCreditablePools : catalog.pools;
  const hasMore = !creditChecked && catalog.hasMore;
  const isRefining = catalog.status === "refining" || filter.isDebouncing;
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
      if (current?.holder !== holderKey) {
        return {
          holder: holderKey,
          initialized: creditReadyForDefault,
          checked: creditReadyForDefault && filteredCreditablePools.length > 0,
        };
      }
      if (!current.initialized && creditReadyForDefault) {
        return {
          holder: holderKey,
          initialized: true,
          checked: filteredCreditablePools.length > 0,
        };
      }
      return current;
    });
  }, [creditReadyForDefault, filteredCreditablePools.length, holderKey]);

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
          <Button asChild variant="outline" className="bg-card">
            <Link to="/pools/create/$step" params={{ step: "pool" }}>
              <RiAddLine className="size-4" aria-hidden="true" />
              <Trans>Create</Trans>
            </Link>
          </Button>
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

      <CatalogSearchField filter={filter} label={t`Search pools`} />

      <PoolFilterFeedback filter={filter} error={catalog.error} onRetry={catalog.retry} />

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

      {creditable.status === "ready" && creditable.hasVerificationGaps ? (
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

      {catalog.status === "ready" && filter.result.ok ? (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <p className="font-medium text-sm tabular-nums">{resultCountLabel}</p>
            <label
              htmlFor="creditable-pools"
              className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id="creditable-pools"
                checked={creditChecked}
                disabled={creditable.status !== "ready"}
                onCheckedChange={(checked) =>
                  setCreditChoice({ holder: holderKey, initialized: true, checked })
                }
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
          </div>
          {pools.length === 0 ? (
            <div className="space-y-3 border border-border bg-card p-3">
              <p className="text-muted-foreground text-sm">
                {creditChecked && filter.isFiltered ? (
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

      {pools.length > 0 ? (
        <section
          className={[
            "border border-border bg-card",
            isRefining ? "opacity-60 transition-opacity" : "",
          ].join(" ")}
          aria-busy={isRefining}
          aria-label={t`Pools list`}
        >
          {pools.map((pool, index) => (
            <PoolRow key={pool.address} pool={pool} isLast={index === pools.length - 1} />
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

function PoolRow({ pool, isLast }: { pool: UserPool; isLast: boolean }) {
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
