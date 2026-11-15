import { poolQueryOptions } from "@clc/api/features/pools/queries";
import type { UserPool } from "@clc/api/features/pools/client";
import { useQueries } from "@tanstack/react-query";

import { poolsClient } from "#/lib/api/pools";

/**
 * The catalog records of the pools the Credit filter reaches. The router names
 * the pools; the Pools list needs their rows, read one cached detail per pool.
 * A pool whose record fails to load is left out and reported as a gap rather
 * than holding the list back.
 */
export function useReachablePools(poolRefs: readonly { address: string }[] | undefined) {
  return useQueries({
    queries: (poolRefs ?? []).map((pool) => poolQueryOptions(poolsClient, pool.address)),
    combine: (results) => {
      const pools = results.flatMap((result) => (result.data ? [result.data] : []));
      const settled = results.every((result) => result.isSuccess || result.isError);
      return {
        pools: pools as UserPool[],
        status: poolRefs === undefined ? "loading" : settled ? "ready" : "loading",
        hasGaps: settled && results.some((result) => result.isError),
      } as const;
    },
  });
}
