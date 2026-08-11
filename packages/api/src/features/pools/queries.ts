import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { PoolsClient } from "./client";

/**
 * Canonical query identity and base options for pool resources.
 *
 * Keys live beside the client that produces the data so one endpoint cannot end
 * up with two competing key shapes. Apps layer their own freshness policy over
 * these options without changing the key or the query function — the same pool
 * list means something different to a phone browsing a catalog and to an
 * operator auditing one.
 */
export const poolKeys = {
  all: ["clc", "pools"] as const,
  list: (perPage: number) => ["clc", "pools", "list", perPage] as const,
  detail: (address: string) => ["clc", "pools", "detail", address.toLowerCase()] as const,
  vouchers: (address: string, perPage: number) =>
    ["clc", "pools", "vouchers", address.toLowerCase(), perPage] as const,
} as const;

export function poolListQueryOptions(pools: PoolsClient, perPage: number) {
  return queryOptions({
    queryKey: poolKeys.list(perPage),
    queryFn: ({ signal }) => pools.getPools({ perPage }, signal),
    placeholderData: keepPreviousData,
  });
}

export function poolQueryOptions(pools: PoolsClient, address: string) {
  return queryOptions({
    queryKey: poolKeys.detail(address),
    queryFn: ({ signal }) => pools.getPoolByAddress(address, signal),
    enabled: address !== "",
  });
}

export function poolVouchersQueryOptions(pools: PoolsClient, address: string, perPage: number) {
  return queryOptions({
    queryKey: poolKeys.vouchers(address, perPage),
    queryFn: ({ signal }) => pools.getPoolVouchers(address, { perPage }, signal),
    enabled: address !== "",
    placeholderData: keepPreviousData,
  });
}
