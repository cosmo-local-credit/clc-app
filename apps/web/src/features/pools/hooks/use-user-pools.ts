import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";

/** Matches activity / account list page size so infinite scroll pages meaningfully. */
const DEFAULT_POOLS_PAGE_SIZE = 20;

export const poolQueryKeys = {
  all: ["pools"] as const,
  list: (perPage: number) => [...poolQueryKeys.all, "list", { perPage }] as const,
  byAddress: (poolAddress: string | undefined) =>
    [...poolQueryKeys.all, "by-address", poolAddress?.toLowerCase() ?? "none"] as const,
};

export function useUserPoolsInfinite(perPage = DEFAULT_POOLS_PAGE_SIZE, enabled = true) {
  return useInfiniteQuery({
    queryKey: poolQueryKeys.list(perPage),
    queryFn: ({ pageParam, signal }) =>
      clcApi.pools.getPools(
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.receivedCount < perPage || lastPage.last === undefined ? undefined : lastPage.last,
  });
}

export function useUserPoolByAddress(poolAddress: string | undefined) {
  return useQuery({
    queryKey: poolQueryKeys.byAddress(poolAddress),
    queryFn: ({ signal }) => clcApi.pools.getPoolByAddress(requirePoolAddress(poolAddress), signal),
    enabled: !!poolAddress,
  });
}

function requirePoolAddress(poolAddress: string | undefined): string {
  if (!poolAddress) throw new Error("Pool address is required.");
  return poolAddress;
}
