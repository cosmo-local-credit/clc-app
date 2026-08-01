import { useInfiniteQuery } from "@tanstack/react-query";

import type { UserPool } from "#/features/pools/api/pools-client";
import { getPoolVouchers } from "#/features/pools/api/pools-client";

const DEFAULT_POOL_VOUCHERS_PAGE_SIZE = 20;

const poolVoucherQueryKeys = {
  all: ["pool-vouchers"] as const,
  list: (poolAddress: string | undefined, perPage: number) =>
    [
      ...poolVoucherQueryKeys.all,
      poolAddress?.toLowerCase() ?? "none",
      "list",
      { perPage },
    ] as const,
};

export function usePoolVouchersInfinite(
  poolAddress: string | undefined,
  perPage = DEFAULT_POOL_VOUCHERS_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: poolVoucherQueryKeys.list(poolAddress, perPage),
    queryFn: ({ pageParam, signal }) =>
      getPoolVouchers(
        requirePoolAddress(poolAddress),
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled: !!poolAddress,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.vouchers.length < perPage || lastPage.last === undefined ? undefined : lastPage.last,
  });
}

export function usePoolVouchers(pool: UserPool | null | undefined) {
  const query = usePoolVouchersInfinite(pool?.address);
  return query.data?.pages.flatMap((page) => page.vouchers) ?? [];
}

function requirePoolAddress(poolAddress: string | undefined): string {
  if (!poolAddress) throw new Error("Pool address is required.");
  return poolAddress;
}
