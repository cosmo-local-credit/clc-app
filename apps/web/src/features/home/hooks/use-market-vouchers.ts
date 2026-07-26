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

/** The map imports the whole catalog so its cluster counts are authoritative. */
export const MARKET_MAP_PAGE_SIZE = 500;

/**
 * Below this zoom a bbox stops being selective — most of the catalog is inside
 * it — so the complete background query is the better source.
 */
export const MIN_VIEWPORT_BBOX_ZOOM = 11;

/**
 * Local freshness overrides (see `docs/TANSTACK_QUERY.md`). This is a bulk
 * import of static catalog data, not live chain state.
 */
const MARKET_QUERY_FRESHNESS = {
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnReconnect: false,
} as const;

export const marketVoucherQueryKeys = {
  all: ["market-vouchers"] as const,
  catalog: (perPage: number) => [...marketVoucherQueryKeys.all, "catalog", { perPage }] as const,
  viewport: (boxes: MarketBoundingBox[], perPage: number) =>
    [...marketVoucherQueryKeys.all, "viewport", { boxes, perPage }] as const,
};

export function useMarketVouchersInfinite(perPage = MARKET_MAP_PAGE_SIZE) {
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
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextCursor(perPage),
    ...MARKET_QUERY_FRESHNESS,
  });
}

/**
 * The backend always emits `first`/`last` as numbers, so `undefined` is never
 * the stop signal. Stop on a short page, an empty-page zero cursor, or a
 * cursor that failed to strictly decrease — the last of which would otherwise
 * page forever against a misbehaving backend.
 *
 * "Short" is measured against the rows the backend sent, not the rows that
 * survived normalization. One malformed voucher must not truncate the catalog.
 */
function nextCursor(perPage: number) {
  return (lastPage: MarketVoucherPage, allPages: MarketVoucherPage[]): number | undefined => {
    if (lastPage.receivedCount < perPage) return undefined;
    if (lastPage.last === 0) return undefined;
    const previous = allPages.at(-2);
    if (previous && lastPage.last >= previous.last) return undefined;
    return lastPage.last;
  };
}

/**
 * One bounded page for the camera that actually won, so the first markers
 * appear before the whole catalog has downloaded. Its cluster counts are
 * provisional until the background catalog makes them authoritative.
 */
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
): MarketMapVouchers {
  const catalog = useMarketVouchersInfinite(perPage);
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

  // Fill the catalog in the background so cluster counts become correct.
  // Guarding on isFetching as well as isFetchingNextPage matters: a stale
  // infinite-query refetch already re-walks every cached page.
  useEffect(() => {
    if (!hasNextPage || isFetching || isFetchingNextPage) return;
    void fetchNextPage();
  }, [hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  const boxes = useMemo(
    () =>
      viewport && viewport.zoom >= MIN_VIEWPORT_BBOX_ZOOM ? viewportToBoundingBoxes(viewport) : [],
    [viewport],
  );

  const bootstrap = useMarketViewportVouchers(boxes, !isCatalogComplete, perPage);

  const vouchers = useMemo(() => {
    const byId = new Map<string, MarketVoucher>();
    // Bootstrap rows first so full-catalog records overwrite the temporary copy.
    for (const entry of bootstrap.data ?? []) byId.set(entry.id, entry);
    for (const catalogPage of data?.pages ?? []) {
      for (const entry of catalogPage.vouchers) byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }, [bootstrap.data, data?.pages]);

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
