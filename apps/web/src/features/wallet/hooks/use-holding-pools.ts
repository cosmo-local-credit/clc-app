import { poolFilteredQueryOptions } from "@clc/api/features/pools/queries";
import type { UserPool } from "@clc/api/features/pools/client";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { useQueries } from "@tanstack/react-query";

import { poolsClient } from "#/lib/api/pools";
import { CHAIN_ID } from "#/lib/chain";

/** Enough to name one pool and say whether there are more. */
const HOLDING_POOLS_PAGE = 3;

/**
 * The pools that accept each listed voucher, from the same server-side voucher
 * filter the pool catalog uses (`/api/v2/pools?vouchers=chain:address`). One
 * small page per voucher: a holdings row names the first pool and counts the
 * rest, it does not list them.
 */
export function useHoldingPools(tokenAddresses: readonly `0x${string}`[]) {
  const results = useQueries({
    queries: tokenAddresses.map((address) => ({
      ...poolFilteredQueryOptions(
        poolsClient,
        { ...EMPTY_CATALOG_FILTER, vouchers: [{ chainId: CHAIN_ID, address }] },
        HOLDING_POOLS_PAGE,
      ),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });
  const pools = new Map<string, { pools: UserPool[]; more: boolean } | null | undefined>();
  tokenAddresses.forEach((address, index) => {
    const result = results[index];
    pools.set(
      address.toLowerCase(),
      result?.data
        ? {
            pools: result.data.pools,
            more: result.data.receivedCount >= HOLDING_POOLS_PAGE,
          }
        : result?.isError
          ? null
          : undefined,
    );
  });
  return pools;
}
