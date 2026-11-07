import type { UserPool } from "@clc/api/features/pools/client";
import { useMemo } from "react";
import { getAddress, isAddress } from "viem";

import { poolActivityFromAccount } from "#/features/pools/logic/pool-activity";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";

/**
 * Everything that has moved through the pool, newest first. The Activity table
 * and the side column's detail read the same pages, so a row opened from a
 * link resolves against what the table shows. `enabled` keeps the feed off
 * (and unpolled) while neither is in use.
 */
export function usePoolActivityFeed(pool: UserPool | undefined, enabled: boolean) {
  // clc-core validates the path parameter as a checksummed address.
  const query = useAccountActivityInfinite(
    pool && isAddress(pool.address) ? getAddress(pool.address) : undefined,
    { poll: true, enabled },
  );
  const pages = query.data?.pages;
  const poolAddress = pool?.address;
  const entries = useMemo(
    () =>
      poolAddress
        ? (pages?.flatMap((page) => page.activity) ?? []).map((item) =>
            poolActivityFromAccount(item, poolAddress),
          )
        : [],
    [pages, poolAddress],
  );
  return { query, entries };
}

export type PoolActivityFeed = ReturnType<typeof usePoolActivityFeed>;
