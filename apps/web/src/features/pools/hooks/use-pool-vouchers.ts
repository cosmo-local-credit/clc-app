import type { UserPool } from "@clc/api/features/pools/client";
import { poolVouchersInfiniteQueryOptions } from "@clc/api/features/pools/queries";
import { useInfiniteQuery } from "@tanstack/react-query";
import { poolsClient } from "#/lib/api/pools";

const DEFAULT_POOL_VOUCHERS_PAGE_SIZE = 20;

export function usePoolVouchersInfinite(
  poolAddress: string | undefined,
  perPage = DEFAULT_POOL_VOUCHERS_PAGE_SIZE,
) {
  return useInfiniteQuery(poolVouchersInfiniteQueryOptions(poolsClient, poolAddress, perPage));
}

export function usePoolVouchers(pool: UserPool | null | undefined) {
  const query = usePoolVouchersInfinite(pool?.address);
  return query.data?.pages.flatMap((page) => page.vouchers) ?? [];
}
