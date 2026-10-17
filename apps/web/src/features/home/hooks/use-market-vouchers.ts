import {
  filterNearbyCatalog,
  useNearbyCatalog,
  useNearbyCatalogFilter,
  nearbyQueryPolicy,
} from "#/components/nearby-catalog";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import {
  type MarketBoundingBox,
  type MarketVoucher,
  viewportToBoundingBoxes,
} from "@clc/api/features/market/client";
import {
  nextMarketCursor,
  voucherCatalogInfiniteQueryOptions,
  voucherKeys,
  voucherViewportQueryOptions,
} from "@clc/api/features/market/queries";
import type { MarketViewport } from "#/features/home/ui/market-map";
import { marketClient } from "#/lib/api/market";

export const MARKET_MAP_PAGE_SIZE = 500;

export const MIN_VIEWPORT_BBOX_ZOOM = 11;

export const MARKET_QUERY_FRESHNESS = {
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnReconnect: false,
} as const;

/**
 * Re-exported so web callers keep one import for market identity. The keys are
 * canonical in @clc/api; only the freshness policy above is app-specific.
 */
export const marketVoucherQueryKeys = voucherKeys;

function useMarketVouchersInfinite(perPage = MARKET_MAP_PAGE_SIZE, enabled = true) {
  const nearby = useNearbyCatalog();
  const visibilityFilter = useNearbyCatalogFilter();
  const options = voucherCatalogInfiniteQueryOptions(marketClient, perPage, nearby);
  return useInfiniteQuery({
    ...options,
    enabled,
    ...MARKET_QUERY_FRESHNESS,
    ...nearbyQueryPolicy(nearby),
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        vouchers: filterNearbyCatalog(page.vouchers, visibilityFilter),
      })),
    }),
  });
}

export { nextMarketCursor };

function useMarketViewportVouchers(boxes: MarketBoundingBox[], enabled: boolean, perPage: number) {
  const nearby = useNearbyCatalog();
  const visibilityFilter = useNearbyCatalogFilter();
  const options = voucherViewportQueryOptions(marketClient, boxes, perPage, nearby);
  return useQuery({
    ...options,
    enabled: enabled && options.enabled,
    ...MARKET_QUERY_FRESHNESS,
    ...nearbyQueryPolicy(nearby),
    select: (data) => filterNearbyCatalog(data, visibilityFilter),
  });
}

export type MarketMapVouchers = {
  vouchers: MarketVoucher[];
  isLoading: boolean;
  isCatalogComplete: boolean;
  error: Error | null;
  retry: () => void;
  /** The catalog is loading, including again after `retry`. */
  retrying: boolean;
};

export function useMarketMapVouchers(
  viewport: MarketViewport | null,
  perPage = MARKET_MAP_PAGE_SIZE,
  enabled = true,
): MarketMapVouchers {
  const catalog = useMarketVouchersInfinite(perPage, enabled);
  const { hasNextPage, isFetching, isFetchingNextPage, fetchNextPage, data, error, refetch } =
    catalog;

  // A failed refresh does not invalidate the last complete catalog snapshot.
  const isCatalogComplete = data !== undefined && !hasNextPage;

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetching || isFetchingNextPage) return;
    void fetchNextPage();
  }, [enabled, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  const boxes = useMemo(
    () =>
      viewport && viewport.zoom >= MIN_VIEWPORT_BBOX_ZOOM ? viewportToBoundingBoxes(viewport) : [],
    [viewport],
  );

  const bootstrap = useMarketViewportVouchers(boxes, enabled && !isCatalogComplete, perPage);

  const vouchers = useMemo(() => {
    if (!enabled) return [];

    const byId = new Map<string, MarketVoucher>();
    // Viewport rows only bridge the initial download. A complete catalog is
    // authoritative, including removals after a distance or visibility change.
    if (!isCatalogComplete) {
      for (const entry of bootstrap.data ?? []) byId.set(entry.id, entry);
    }
    for (const catalogPage of data?.pages ?? []) {
      for (const entry of catalogPage.vouchers) byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }, [enabled, isCatalogComplete, bootstrap.data, data?.pages]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    vouchers,
    isLoading: catalog.isPending,
    isCatalogComplete,
    error: error ?? null,
    retry,
    retrying: isFetching,
  };
}
