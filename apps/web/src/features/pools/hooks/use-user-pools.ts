import { poolListInfiniteQueryOptions, poolQueryOptions } from "@clc/api/features/pools/queries";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";

/** Matches activity / account list page size so infinite scroll pages meaningfully. */
const DEFAULT_POOLS_PAGE_SIZE = 20;

export function useUserPoolsInfinite(perPage = DEFAULT_POOLS_PAGE_SIZE, enabled = true) {
  return useInfiniteQuery({
    ...poolListInfiniteQueryOptions(clcApi.pools, perPage),
    enabled,
  });
}

export function useUserPoolByAddress(poolAddress: string | undefined) {
  return useQuery(poolQueryOptions(clcApi.pools, poolAddress));
}
