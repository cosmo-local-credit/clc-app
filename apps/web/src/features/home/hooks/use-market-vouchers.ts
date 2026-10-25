import { useInfiniteQuery, useQuery, keepPreviousData } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import type { MarketVoucher } from "@clc/api/features/market/client";
import {
  nextMarketCursor,
  voucherCatalogInfiniteQueryOptions,
  voucherKeys,
} from "@clc/api/features/market/queries";
import { marketClient } from "#/lib/api/market";

export const MARKET_MAP_PAGE_SIZE = 500;

export const MARKET_QUERY_FRESHNESS = {
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnReconnect: false,
} as const;

export const marketVoucherQueryKeys = voucherKeys;
export { nextMarketCursor };

export type MarketMapVouchers = {
  vouchers: MarketVoucher[];
  isLoading: boolean;
  isCatalogComplete: boolean;
  error: Error | null;
  retry: () => void;
  retrying: boolean;
};

export function useMarketMapVouchers(
  bounds: readonly MarketBoundingBox[] | null = [],
  perPage = MARKET_MAP_PAGE_SIZE,
  enabled = true,
): MarketMapVouchers {
  const canonicalBounds = bounds ?? [];
  const isBounded = canonicalBounds.length > 0;
  const global = useInfiniteQuery({
    ...voucherCatalogInfiniteQueryOptions(marketClient, perPage),
    enabled: enabled && !isBounded,
    ...MARKET_QUERY_FRESHNESS,
  });
  const bounded = useQuery({
    queryKey: voucherKeys.viewport(canonicalBounds, perPage),
    enabled: enabled && isBounded,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const vouchers: MarketVoucher[] = [];
      let cursor: number | undefined;
      for (;;) {
        const page = await marketClient.getMarketVouchers(
          {
            perPage,
            bounds: canonicalBounds,
            cursor,
            next: cursor === undefined ? undefined : true,
          },
          signal,
        );
        vouchers.push(...page.vouchers);
        if (
          page.receivedCount < perPage ||
          page.last === 0 ||
          (cursor !== undefined && page.last >= cursor)
        )
          return vouchers;
        cursor = page.last;
      }
    },
    ...MARKET_QUERY_FRESHNESS,
  });

  useEffect(() => {
    if (
      !enabled ||
      isBounded ||
      global.isError ||
      !global.hasNextPage ||
      global.isFetching ||
      global.isFetchingNextPage
    )
      return;
    void global.fetchNextPage();
  }, [enabled, isBounded, global]);

  const vouchers = useMemo(() => {
    if (!enabled) return [];
    if (isBounded) {
      return bounded.data ?? global.data?.pages.flatMap((page) => page.vouchers) ?? [];
    }
    return global.data?.pages.flatMap((page) => page.vouchers) ?? [];
  }, [bounded.data, enabled, global.data?.pages, isBounded]);

  const retry = useCallback(() => {
    if (isBounded) void bounded.refetch();
    else void global.refetch();
  }, [bounded, global, isBounded]);

  return {
    vouchers,
    isLoading: isBounded ? bounded.isPending : global.isPending,
    isCatalogComplete: isBounded ? bounded.data !== undefined : !global.hasNextPage,
    error: (isBounded ? bounded.error : global.error) ?? null,
    retry,
    retrying: isBounded ? bounded.isFetching : global.isFetching,
  };
}
