import { useEffect } from "react";
import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import { parseCatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { useInfiniteQuery } from "@tanstack/react-query";

import { nearbyQueryPolicy, useNearbyCatalog } from "#/components/nearby-catalog";
import { marketplaceClient } from "#/lib/api/marketplace";
import { useDebouncedValue } from "#/lib/use-debounced-value";

const SUGGESTION_ROWS = 10;
const AUTO_PAGE_BUDGET = 6;
const SUGGESTED_VOUCHERS = 5;
const SUGGESTED_POOLS = 3;

export type VoucherSuggestion = Extract<MarketplaceResult, { kind: "voucher" }>;
export type PoolSuggestion = Extract<MarketplaceResult, { kind: "pool" }>;

/**
 * What the market's search screen offers while it is open: the tag vocabulary
 * at rest, and the vouchers and pools the marketplace search finds as the
 * draft settles. Both come from the marketplace endpoint the map already
 * searches, within the same nearby scope.
 */
export function useMarketSearchSuggestions(draft: string) {
  const nearby = useNearbyCatalog();
  const { settled } = useDebouncedValue(draft);
  const parsed = parseCatalogFilter({ q: settled });
  const term = parsed.ok ? parsed.filter.term : "";

  const vocabulary = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      perPage: 1,
      facets: true,
      nearby: nearby?.nearby === true,
      scope: nearby?.scope,
      bounds: nearby?.bounds,
    }),
    ...nearbyQueryPolicy(nearby),
  });
  const matches = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      perPage: SUGGESTION_ROWS,
      q: term,
      kinds: ["voucher", "pool"],
      nearby: nearby?.nearby === true,
      scope: nearby?.scope,
      bounds: nearby?.bounds,
    }),
    enabled: term !== "",
    ...nearbyQueryPolicy(nearby),
  });

  const rows = term === "" ? [] : (matches.data?.pages.flatMap((page) => page.results) ?? []);

  const vouchers = rows
    .filter((row): row is VoucherSuggestion => row.kind === "voucher")
    .slice(0, SUGGESTED_VOUCHERS);
  const pools = rows
    .filter((row): row is PoolSuggestion => row.kind === "pool")
    .slice(0, SUGGESTED_POOLS);
  const needsMore =
    term !== "" && (vouchers.length < SUGGESTED_VOUCHERS || pools.length < SUGGESTED_POOLS);
  const pageCount = matches.data?.pages.length ?? 0;
  const autoPage = needsMore && matches.hasNextPage && pageCount < AUTO_PAGE_BUDGET;
  const { fetchNextPage, isFetching, isError } = matches;
  useEffect(() => {
    if (autoPage && !isFetching && !isError) void fetchNextPage();
  }, [autoPage, pageCount, isFetching, isError, fetchNextPage]);

  return {
    // This is vocabulary for public search, not a count of nearby matches.
    tags: (vocabulary.data?.pages[0]?.tagFacets ?? [])
      .filter((facet) => facet.count > 0)
      .map((facet) => facet.tag),
    vouchers,
    pools,
    isLoading: term !== "" && (matches.isFetching || (autoPage && !matches.isError)),
    isError: term !== "" && matches.isError,
    hasMore: needsMore && matches.hasNextPage,
    loadMore: () => void matches.fetchNextPage(),
    retry: () => void (matches.isFetchNextPageError ? matches.fetchNextPage() : matches.refetch()),
  };
}
