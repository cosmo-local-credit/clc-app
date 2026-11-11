import type { ActivityKind } from "@clc/api/features/accounts/client";
import type { UserPool } from "@clc/api/features/pools/client";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { getAddress, isAddress } from "viem";

import { ENTRY_PARAM } from "#/lib/navigation/pool-side";
import { poolActivityFromAccount } from "#/features/pools/logic/pool-activity";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { parseActivitySearch } from "#/lib/navigation/activity-search";

/**
 * Everything that has moved through the pool, newest first, of the kinds the
 * filter names (every kind when it names none). The Activity table and the
 * side column's detail read the same pages, so a row opened from a link
 * resolves against what the table shows. `enabled` keeps the feed off (and
 * unpolled) while neither is in use.
 */
export function usePoolActivityFeed(
  pool: UserPool | undefined,
  enabled: boolean,
  types: readonly ActivityKind[],
) {
  // clc-core validates the path parameter as a checksummed address.
  const query = useAccountActivityInfinite(
    pool && isAddress(pool.address) ? getAddress(pool.address) : undefined,
    { poll: true, enabled, types },
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

/**
 * The Activity tab's type filter, the phone's filter sheet as a URL param:
 * the wallet's `activityTypes`, read and ordered by the same parser. A new
 * choice replaces the entry, so Back leaves the pool rather than stepping
 * through filters, and it closes an open row, which the new filter may hide.
 */
export function usePoolActivityTypes() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const types = parseActivitySearch(search).types;
  const setTypes = (next: readonly ActivityKind[]) => {
    void navigate({
      to: ".",
      search: ((previous: Record<string, unknown>) => ({
        ...previous,
        activityTypes: next.length > 0 ? next.join(",") : undefined,
        [ENTRY_PARAM]: undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    });
  };
  return { types, setTypes };
}
