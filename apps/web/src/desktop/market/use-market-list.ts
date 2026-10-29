import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import type { Offering } from "@clc/api/features/offerings/client";
import { offeringsDiscoveryInfiniteQueryOptions } from "@clc/api/features/offerings/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import type { MarketplaceKind, MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { nearbyQueryPolicy, useNearbyCatalog } from "#/components/nearby-catalog";
import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import type { OutputVoucherBrowse } from "#/features/home/hooks/use-output-voucher-browse";
import { marketplaceClient } from "#/lib/api/marketplace";
import { offeringsClient } from "#/lib/api/offerings";
import type { MarketListScope } from "#/lib/navigation/marketplace-search";

const LIST_KINDS: Record<Exclude<MarketListScope, "all">, readonly MarketplaceKind[]> = {
  offers: ["offering"],
  wants: ["want"],
  vouchers: ["voucher"],
  pools: ["pool"],
  catalogs: ["catalog"],
};

/**
 * What the list shows, as one phase.
 *
 * - `blocked`: a link or a check that must not be broadened (a bad Credit or
 *   output link, Credit with no pool). Nothing is requested and no rows show.
 * - `loading`: no result set has arrived yet.
 * - `failed`: the first request failed and there is nothing to keep.
 * - `ready`: rows are on screen, current or retained from the search before.
 */
export type MarketListPhase = "blocked" | "loading" | "failed" | "ready";

/**
 * The market list's data: the page chain of one scope, with the rows of the
 * previous search kept while the next is on its way, and the next page's own
 * state kept apart from the first request's. Offers read the phone Offers
 * page's discovery query, whose rows carry the quantity and frequency a tile
 * shows; every other scope reads the marketplace endpoint.
 */
export function useMarketList({
  scope,
  filter,
  credit,
  output,
}: {
  scope: MarketListScope;
  filter: MarketFilterControls;
  credit: ReturnType<typeof useCreditableBrowse>;
  output: OutputVoucherBrowse;
}) {
  const nearby = useNearbyCatalog();
  const parsed = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const kinds = scope === "all" ? undefined : LIST_KINDS[scope];
  const blocked = !filter.result.ok || credit.blocksResults || output.blocksResults;
  const ready = !blocked && !filter.isRestoringPreference && !filter.isDebouncing;
  const common = {
    perPage: 20,
    q: parsed.term,
    tags: parsed.tags,
    tagMatch: parsed.tagMatch,
    facets: true,
    nearby: nearby?.nearby === true,
    scope: nearby?.scope,
    bounds: nearby?.bounds,
    // Credit's pools, narrowed to the requested output's when the link has one.
    ...(output.poolRefs ? { pools: output.poolRefs } : {}),
  };
  const marketplace = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, { ...common, kinds }),
    enabled: ready && scope !== "offers",
    placeholderData: keepPreviousData,
    ...nearbyQueryPolicy(nearby),
  });
  const offers = useInfiniteQuery({
    ...offeringsDiscoveryInfiniteQueryOptions(offeringsClient, common),
    enabled: ready && scope === "offers",
    placeholderData: keepPreviousData,
    ...nearbyQueryPolicy(nearby),
  });
  const active = scope === "offers" ? offers : marketplace;
  const { fetchNextPage, refetch } = active;
  const load = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const retry = useCallback(() => void refetch(), [refetch]);

  const hasData = !blocked && active.data !== undefined;
  const rows: MarketplaceResult[] = hasData
    ? (marketplace.data?.pages.flatMap((page) => page.results) ?? [])
    : [];
  const offerings: Offering[] = hasData
    ? (offers.data?.pages.flatMap((page) => page.offerings) ?? [])
    : [];
  const facets =
    (hasData
      ? scope === "offers"
        ? offers.data?.pages[0]?.tagFacets
        : marketplace.data?.pages[0]?.tagFacets
      : undefined) ?? [];

  const phase: MarketListPhase = blocked
    ? "blocked"
    : hasData
      ? "ready"
      : active.isError
        ? "failed"
        : "loading";
  const nextFailed = hasData && active.isFetchNextPageError;
  const hasMore = hasData && !active.isPlaceholderData && active.hasNextPage;

  return {
    phase,
    rows,
    offerings,
    facets,
    count: scope === "offers" ? offerings.length : rows.length,
    /** The rows are the previous search's, kept until this one's arrive. */
    retained: hasData && (active.isPlaceholderData || filter.isDebouncing),
    /** A request other than the next page is running behind rows already shown. */
    refreshing: hasData && active.isFetching && !active.isFetchingNextPage,
    /** The latest refresh failed; the rows on screen are the last good ones. */
    refreshFailed: hasData && active.isError && !active.isFetchNextPageError,
    error: active.error,
    fetching: active.isFetching,
    retry,
    next: {
      hasMore,
      loading: hasData && active.isFetchingNextPage,
      failed: nextFailed,
      load,
    },
  };
}
