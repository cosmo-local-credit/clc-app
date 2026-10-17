import type { UserPool } from "@clc/api/features/pools/client";
import { poolVouchersInfiniteQueryOptions } from "@clc/api/features/pools/queries";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { poolsClient } from "#/lib/api/pools";

const DEFAULT_POOL_VOUCHERS_PAGE_SIZE = 20;

/**
 * clc-core's `normalizePaginationWithMax` silently clamps `perPage` to
 * `catalogMaxPerPage`. Asking for more than this returns this many, and
 * `getNextPageParam` reads the short page as the last one — so a larger number
 * does not fetch more, it drops everything past the first hundred rows.
 */
const POOL_VOUCHERS_MAX_PAGE_SIZE = 100;

export function usePoolVouchersInfinite(
  poolAddress: string | undefined,
  perPage = DEFAULT_POOL_VOUCHERS_PAGE_SIZE,
) {
  return useInfiniteQuery(poolVouchersInfiniteQueryOptions(poolsClient, poolAddress, perPage));
}

export type PoolVouchersOptions = {
  /**
   * Walk every page before reporting the list complete.
   *
   * Off by default: a screen that lists vouchers can page as the reader scrolls.
   * A picker cannot — a partial list is one a holder reads as "this pool doesn't
   * take my voucher", and there is nothing on screen to tell them otherwise.
   */
  all?: boolean;
};

/**
 * A pool's catalog vouchers with the query state a picker needs to tell "still
 * loading" from "this pool has nothing", which the bare array cannot express.
 */
export function usePoolVouchersWithStatus(
  pool: UserPool | null | undefined,
  { all = false }: PoolVouchersOptions = {},
) {
  const query = usePoolVouchersInfinite(
    pool?.address,
    all ? POOL_VOUCHERS_MAX_PAGE_SIZE : DEFAULT_POOL_VOUCHERS_PAGE_SIZE,
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  useEffect(() => {
    if (!all || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [all, fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    vouchers: query.data?.pages.flatMap((page) => page.vouchers) ?? [],
    // Still draining counts as pending: a short list presented as final is the
    // bug this option exists to close.
    isPending: query.isPending || (all && (hasNextPage || isFetchingNextPage)),
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

export function usePoolVouchers(pool: UserPool | null | undefined, options?: PoolVouchersOptions) {
  return usePoolVouchersWithStatus(pool, options).vouchers;
}
