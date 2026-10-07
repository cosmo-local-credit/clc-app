import {
  filterNearbyCatalog,
  useNearbyCatalog,
  useNearbyCatalogFilter,
  nearbyQueryPolicy,
} from "#/components/nearby-catalog";
import {
  poolListInfiniteQueryOptions,
  poolQueryOptions,
  poolsByOwnerInfiniteQueryOptions,
} from "@clc/api/features/pools/queries";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { poolsClient } from "#/lib/api/pools";

/** Matches activity / account list page size so infinite scroll pages meaningfully. */
const DEFAULT_POOLS_PAGE_SIZE = 20;

export function useUserPoolsInfinite(perPage = DEFAULT_POOLS_PAGE_SIZE, enabled = true) {
  const nearby = useNearbyCatalog();
  const visibilityFilter = useNearbyCatalogFilter();
  const options = poolListInfiniteQueryOptions(poolsClient, perPage, nearby);
  return useInfiniteQuery({
    ...options,
    ...nearbyQueryPolicy(nearby),
    enabled,
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        pools: filterNearbyCatalog(
          page.pools.map((pool) => ({ ...pool, lat: pool.geoLat, lng: pool.geoLng })),
          visibilityFilter,
        ).map(({ lat: _lat, lng: _lng, ...pool }) => pool),
      })),
    }),
  });
}

export function useUserPoolByAddress(poolAddress: string | undefined) {
  return useQuery(poolQueryOptions(poolsClient, poolAddress));
}

/**
 * The pools this address deployed, newest first.
 *
 * Ownership is the catalog's `owner_address`, not "deployed through this
 * account": a steward who published a pool from another device, or before this
 * account existed, still owns it, and the pool detail screen already decides who
 * may manage a pool by that same comparison.
 */
export function useOwnedPoolsInfinite(owner: string | undefined) {
  return useInfiniteQuery(
    poolsByOwnerInfiniteQueryOptions(poolsClient, owner, DEFAULT_POOLS_PAGE_SIZE),
  );
}
