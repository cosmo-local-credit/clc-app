import { useNearbyCatalog, nearbyQueryPolicy } from "#/components/nearby-catalog";
import {
  poolListInfiniteQueryOptions,
  poolQueryOptions,
  ownedPoolQueryOptions,
  ownedPoolsInfiniteQueryOptions,
} from "@clc/api/features/pools/queries";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { poolsClient } from "#/lib/api/pools";

/** Matches activity / account list page size so infinite scroll pages meaningfully. */
const DEFAULT_POOLS_PAGE_SIZE = 20;

export function useUserPoolsInfinite(perPage = DEFAULT_POOLS_PAGE_SIZE, enabled = true) {
  const nearby = useNearbyCatalog();
  const options = poolListInfiniteQueryOptions(poolsClient, perPage, nearby);
  return useInfiniteQuery({
    ...options,
    ...nearbyQueryPolicy(nearby),
    enabled,
  });
}

export function useUserPoolByAddress(poolAddress: string | undefined, viewer?: string) {
  const publicQuery = useQuery({
    ...poolQueryOptions(poolsClient, poolAddress),
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false,
  });
  const ownerQuery = useQuery({
    ...ownedPoolQueryOptions(poolsClient, poolAddress, viewer),
    enabled: !!viewer && !!poolAddress && publicQuery.isError,
  });
  return publicQuery.isError && viewer ? ownerQuery : publicQuery;
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
    ownedPoolsInfiniteQueryOptions(poolsClient, owner, DEFAULT_POOLS_PAGE_SIZE),
  );
}
