import { useCallback, useEffect, useMemo } from "react";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { marketBoundsKey } from "@clc/core/features/catalog/nearby";

import type { HexAddress } from "@clc/core/features/catalog/logic";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { poolListInfiniteQueryOptions } from "@clc/api/features/pools/queries";
import { poolsClient } from "#/lib/api/pools";
import type { MarketLocation } from "#/features/home/ui/market-data";

/** clc-core caps a pool page at 100 rows. */
const MARKET_POOLS_PAGE_SIZE = 100;

export type MarketPoolLocation = MarketLocation & { kind: "pool"; address: HexAddress };

export type MarketMapPools = {
  pools: MarketPoolLocation[];
  error: Error | null;
  retry: () => void;
  /** The pools are loading, including again after `retry`. */
  retrying: boolean;
};

/**
 * Every pool with a location, as markers for the market map.
 *
 * The catalog is small enough to walk to the end: tens of pools against
 * thousands of vouchers. Ids are namespaced because a pool's catalog id and a
 * voucher's are both plain integers, and the map tells markers apart by id.
 */
export function useMarketMapPools(
  enabled: boolean,
  bounds: readonly MarketBoundingBox[] = [],
): MarketMapPools {
  const options = poolListInfiniteQueryOptions(poolsClient, MARKET_POOLS_PAGE_SIZE, {
    nearby: false,
    scope: `map:${marketBoundsKey(bounds)}`,
    ...(bounds.length ? { bounds } : {}),
  });
  const {
    data,
    error,
    isError,
    isFetchNextPageError,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({ ...options, enabled, placeholderData: keepPreviousData });

  // A failed page keeps `hasNextPage`, so walking on through an error would
  // request it again each time the last attempt settles, past every retry
  // limit. It waits for `retry` instead.
  useEffect(() => {
    if (!enabled || isError || !hasNextPage || isFetching || isFetchingNextPage) return;
    void fetchNextPage();
  }, [enabled, isError, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  // Resumes from the page that failed; the walk picks up again once it lands.
  const retry = useCallback(() => {
    void (isFetchNextPageError ? fetchNextPage() : refetch());
  }, [isFetchNextPageError, fetchNextPage, refetch]);

  const pools = useMemo(() => {
    if (!enabled) return [];

    const byAddress = new Map<string, MarketPoolLocation>();
    for (const page of data?.pages ?? []) {
      for (const pool of page.pools) {
        const lat = pool.geoLat;
        const lng = pool.geoLng;
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
        const address = pool.address.toLowerCase();
        byAddress.set(address, {
          id: `pool:${address}`,
          name: pool.name,
          kind: "pool",
          markerIcon: null,
          markerColor: null,
          lat,
          lng,
          locationName: pool.locationName,
          address: pool.address,
        });
      }
    }
    return [...byAddress.values()];
  }, [enabled, data?.pages]);

  const retrying = enabled && (isFetching || isFetchingNextPage);
  return useMemo(
    () => ({ pools, error: enabled ? error : null, retry, retrying }),
    [pools, enabled, error, retry, retrying],
  );
}
