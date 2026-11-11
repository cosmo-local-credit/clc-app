import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import type { MarketMapKind } from "@clc/core/features/market-map/logic";
import type { MarketplaceKind } from "@clc/core/features/marketplace/logic";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import type { OutputVoucherBrowse } from "#/features/home/hooks/use-output-voucher-browse";
import { marketplaceClient } from "#/lib/api/marketplace";

const MARKETPLACE_KIND: Record<MarketMapKind, MarketplaceKind> = {
  voucher: "voucher",
  want: "want",
  pool: "pool",
  catalog: "catalog",
  post: "post",
};

/**
 * The exact-viewport result chain beside the clustered map. It is deliberately
 * separate from the buffered marker request: clusters stay bounded while this
 * cursor exposes every underlying resource represented in the visible area.
 */
export function useMarketViewportList({
  filter,
  credit,
  output,
  kinds,
  bounds,
  settled,
}: {
  filter: MarketFilterControls;
  credit: ReturnType<typeof useCreditableBrowse>;
  output: Pick<OutputVoucherBrowse, "poolRefs" | "blocksResults">;
  kinds: readonly MarketMapKind[];
  bounds: readonly MarketBoundingBox[];
  settled: boolean;
}) {
  const parsed = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const blocked =
    kinds.length === 0 ||
    !filter.result.ok ||
    credit.blocksResults ||
    output.blocksResults ||
    (credit.enabled && credit.poolRefs?.length === 0);
  const enabled = settled && !blocked && !filter.isRestoringPreference && !filter.isDebouncing;
  const query = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      scope: "desktop-map",
      perPage: 20,
      q: parsed.term,
      tags: parsed.tags,
      tagMatch: parsed.tagMatch,
      kinds: kinds.map((kind) => MARKETPLACE_KIND[kind]),
      bounds,
      sort: "nearest",
      ...(output.poolRefs ? { pools: output.poolRefs } : {}),
    }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const { fetchNextPage, refetch } = query;
  const load = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const retry = useCallback(() => void refetch(), [refetch]);
  const hasData = !blocked && query.data !== undefined;
  const rows = hasData ? query.data.pages.flatMap((page) => page.results) : [];
  const total = hasData ? (query.data.pages[0]?.total ?? rows.length) : 0;

  return {
    rows,
    total,
    hasData,
    blocked,
    loading: enabled && !hasData && query.isPending,
    retained: hasData && (query.isPlaceholderData || filter.isDebouncing),
    refreshing: hasData && query.isFetching && !query.isFetchingNextPage,
    error: query.error,
    retry,
    next: {
      hasMore: hasData && !query.isPlaceholderData && query.hasNextPage,
      loading: hasData && query.isFetchingNextPage,
      failed: hasData && query.isFetchNextPageError,
      load,
    },
  };
}
