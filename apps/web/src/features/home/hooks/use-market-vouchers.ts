import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import {
  type MarketBoundingBox,
  type MarketVoucher,
  type MarketVoucherPage,
  getMarketVouchers,
  viewportToBoundingBoxes,
} from "#/features/home/api/market-client";
import type { MarketViewport } from "#/features/home/ui/market-map";

export const MARKET_MAP_PAGE_SIZE = 500;

export const MIN_VIEWPORT_BBOX_ZOOM = 11;

export const MARKET_QUERY_FRESHNESS = {
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnReconnect: false,
} as const;

export const marketVoucherQueryKeys = {
  all: ["market-vouchers"] as const,
  catalog: (perPage: number) => [...marketVoucherQueryKeys.all, "catalog", { perPage }] as const,
  viewport: (boxes: MarketBoundingBox[], perPage: number) =>
    [...marketVoucherQueryKeys.all, "viewport", { boxes, perPage }] as const,
  filtered: (filter: CatalogFilter | null, perPage: number) =>
    [...marketVoucherQueryKeys.all, "filtered", { filter, perPage }] as const,
  facetVocabulary: () => [...marketVoucherQueryKeys.all, "facet-vocabulary"] as const,
};

export function useMarketVouchersInfinite(perPage = MARKET_MAP_PAGE_SIZE, enabled = true) {
  return useInfiniteQuery({
    queryKey: marketVoucherQueryKeys.catalog(perPage),
    queryFn: ({ pageParam, signal }) =>
      getMarketVouchers(
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextMarketCursor(perPage),
    ...MARKET_QUERY_FRESHNESS,
  });
}

export function nextMarketCursor(perPage: number) {
  return (lastPage: MarketVoucherPage, allPages: MarketVoucherPage[]): number | undefined => {
    if (lastPage.receivedCount < perPage) return undefined;
    if (lastPage.last === 0) return undefined;
    const previous = allPages.at(-2);
    if (previous && lastPage.last >= previous.last) return undefined;
    return lastPage.last;
  };
}

function useMarketViewportVouchers(boxes: MarketBoundingBox[], enabled: boolean, perPage: number) {
  return useQuery({
    queryKey: marketVoucherQueryKeys.viewport(boxes, perPage),
    queryFn: async ({ signal }) => {
      const pages = await Promise.all(
        boxes.map((bbox) => getMarketVouchers({ perPage, bbox }, signal)),
      );
      return pages.flatMap((entry) => entry.vouchers);
    },
    enabled: enabled && boxes.length > 0,
    ...MARKET_QUERY_FRESHNESS,
  });
}

export type MarketMapVouchers = {
  vouchers: MarketVoucher[];
  isLoading: boolean;
  isCatalogComplete: boolean;
  error: Error | null;
  retry: () => void;
};

export function useMarketMapVouchers(
  viewport: MarketViewport | null,
  perPage = MARKET_MAP_PAGE_SIZE,
  enabled = true,
): MarketMapVouchers {
  const catalog = useMarketVouchersInfinite(perPage, enabled);
  const {
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    isSuccess,
    data,
    error,
    refetch,
  } = catalog;

  const isCatalogComplete = isSuccess && !hasNextPage;

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
    for (const entry of bootstrap.data ?? []) byId.set(entry.id, entry);
    for (const catalogPage of data?.pages ?? []) {
      for (const entry of catalogPage.vouchers) byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }, [enabled, bootstrap.data, data?.pages]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    vouchers,
    isLoading: catalog.isPending,
    isCatalogComplete,
    error: error ?? null,
    retry,
  };
}
