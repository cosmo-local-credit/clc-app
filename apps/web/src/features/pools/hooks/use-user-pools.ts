import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { getPoolByAddress, getPools } from "#/features/pools/api/pools-client";

/** Matches activity / account list page size so infinite scroll pages meaningfully. */
const DEFAULT_POOLS_PAGE_SIZE = 20;

const poolQueryKeys = {
  all: ["pools"] as const,
  list: (perPage: number) => [...poolQueryKeys.all, "list", { perPage }] as const,
  byAddress: (poolAddress: string | undefined) =>
    [...poolQueryKeys.all, "by-address", poolAddress?.toLowerCase() ?? "none"] as const,
};

/** Global confirmed pools catalog with cursor pagination. */
export function useUserPoolsInfinite(perPage = DEFAULT_POOLS_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: poolQueryKeys.list(perPage),
    queryFn: ({ pageParam }) =>
      getPools({
        perPage,
        cursor: pageParam,
        next: pageParam === undefined ? undefined : true,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pools.length < perPage || lastPage.last === undefined ? undefined : lastPage.last,
  });
}

export function useUserPoolByAddress(poolAddress: string | undefined) {
  return useQuery({
    queryKey: poolQueryKeys.byAddress(poolAddress),
    queryFn: () => getPoolByAddress(requirePoolAddress(poolAddress)),
    enabled: !!poolAddress,
  });
}

function requirePoolAddress(poolAddress: string | undefined): string {
  if (!poolAddress) throw new Error("Pool address is required.");
  return poolAddress;
}
