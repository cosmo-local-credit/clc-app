import type { UserPool } from "@clc/api/features/pools/client";
import { clcQueries } from "@clc/api/queries";
import { useQuery } from "@tanstack/react-query";

const DIRECTORY_PAGE_SIZE = 100;

export type KnownOperator = {
  address: string;
  poolCount: number;
  /** Names of the pools this address owns, for the directory table. */
  owns: Array<string>;
};

/** Pool fields the derivation reads. Keeps the pure function testable. */
type OwnedPool = Pick<UserPool, "name" | "ownerAddress">;

/**
 * Collapse a page of pools into the distinct addresses that own them.
 *
 * Pools with no owner address contribute nothing — a missing owner is missing
 * data, not an anonymous operator.
 */
export function deriveOperators(pools: ReadonlyArray<OwnedPool>): Array<KnownOperator> {
  const byAddress = new Map<string, KnownOperator>();

  for (const pool of pools) {
    if (!pool.ownerAddress) continue;
    const operator = byAddress.get(pool.ownerAddress) ?? {
      address: pool.ownerAddress,
      poolCount: 0,
      owns: [],
    };
    operator.poolCount += 1;
    operator.owns.push(pool.name);
    byAddress.set(pool.ownerAddress, operator);
  }

  return [...byAddress.values()].sort(
    (left, right) => right.poolCount - left.poolCount || left.address.localeCompare(right.address),
  );
}

/**
 * Derived operator directory.
 *
 * clc-core exposes no user-directory endpoint — accounts are only addressable
 * one at a time (`/api/v2/accounts/{address}/…`). So the directory is derived
 * from ownership: any address that owns a pool is a known operator. The market
 * voucher catalog carries no owner address, so voucher ownership cannot
 * contribute until a per-voucher owner lookup exists.
 *
 * Derived, not stored: this reads the cached pool list query and computes on
 * every render rather than mirroring anything into a store. When a real
 * directory endpoint lands, replace the body and keep the return shape.
 */
export function useKnownOperators() {
  const poolsQuery = useQuery(clcQueries.poolList(DIRECTORY_PAGE_SIZE));

  return {
    operators: deriveOperators(poolsQuery.data?.pools ?? []),
    isPending: poolsQuery.isPending,
    isError: poolsQuery.isError,
    error: poolsQuery.error,
  };
}
