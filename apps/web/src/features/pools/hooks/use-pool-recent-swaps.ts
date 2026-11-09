import { useEffect } from "react";
import { getAddress, isAddress } from "viem";

import { countSwapsSince, poolActivityFromAccount } from "#/features/pools/logic/pool-activity";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** 20 classified rows a page; a swap is one row. */
const RECENT_SWAPS_MAX_PAGES = 10;

/**
 * Swaps in the last 30 days, counted from the same classified activity feed
 * the activity tab reads (and sharing its cache). The feed has no date filter, so
 * pages are walked newest first until one predates the window, capped at
 * `RECENT_SWAPS_MAX_PAGES`; past the cap `complete` is false and the count is
 * a floor.
 */
export function usePoolRecentSwaps(poolAddress: string, enabled = true) {
  // clc-core validates the path parameter as a checksummed address.
  const query = useAccountActivityInfinite(
    isAddress(poolAddress) ? getAddress(poolAddress) : undefined,
    { poll: true, enabled },
  );
  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap((page) =>
    page.activity.map((item) => poolActivityFromAccount(item, poolAddress)),
  );
  // Measured from the first render's clock is precise enough for a 30-day tally.
  const since = new Date(Date.now() - WINDOW_MS);
  const { count, complete } = countSwapsSince(entries, since, query.hasNextPage);
  const canWalk = pages.length < RECENT_SWAPS_MAX_PAGES;
  const { fetchNextPage, isFetchingNextPage } = query;

  useEffect(() => {
    if (enabled && !complete && canWalk && !isFetchingNextPage) void fetchNextPage();
  }, [canWalk, complete, enabled, fetchNextPage, isFetchingNextPage]);

  return {
    count,
    complete,
    isPending: query.isPending || (!complete && canWalk),
    isError: query.isError,
  };
}
