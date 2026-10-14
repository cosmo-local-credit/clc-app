import type { PoolVoucher } from "@clc/api/features/pools/client";
import { poolVouchersQueryOptions } from "@clc/api/features/pools/queries";
import { useQuery } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * The maximum page clc-core serves for a catalog resource.
 *
 * The voucher page is the pool's composition, not a list to scroll: the summary
 * tiles, the price-feed grouping and the vouchers table all count over it, so
 * asking for the largest page the backend allows is what keeps those figures
 * describing the pool rather than describing a page of it.
 */
const VOUCHER_PAGE_SIZE = 100;

const SETTLE_POLL_MS = 3_000;

/**
 * Shorter than the console's two-minute default, because this read is not list
 * data an operator is paging: the indexer rewrites it whenever anyone touches
 * the pool's registry, limiter or quoter, including from outside this console.
 */
const VOUCHERS_STALE_TIME_MS = 15_000;

/** How long to keep waiting for the indexer before giving up on its own. */
const SETTLE_TIMEOUT_MS = 90_000;

/**
 * A pool's vouchers, polled while a newly added one is still settling.
 *
 * Adding a voucher is not a write to this catalog. The console signs three
 * contract calls, the chain confirms them, eth-tracker decodes the logs, and
 * clc-core projects them into `pool_tokens` off NATS — so the row appears
 * seconds *after* the transaction the operator watched succeed. Invalidating on
 * success therefore refetches the old composition and presents it as the new
 * one, which is why the table used to look unchanged until some later refresh
 * happened to catch up.
 *
 * The fix is the poll-until-done shape `apps/web` uses for operation tracking
 * (`use-otx-tracking.ts`): `refetchInterval` as a callback that returns false
 * the moment the awaited row lands, so this costs nothing on a screen nobody is
 * adding to. It also stops on a deadline — if the indexer is down the row is
 * never coming, and a console left open should not poll all afternoon over it.
 *
 * `refetchIntervalInBackground` stays false, matching the account balances
 * policy rather than OTX tracking's: this is a desktop console, and an operator
 * who switched tabs is not watching for the row.
 *
 * The poll only covers the minute after an add. The staleness policy below
 * covers the rest: composition also changes when someone touches the contracts
 * from outside this console, and the console's two-minute default would show a
 * revisited pool as it was.
 */
export function usePoolVouchers(address: string, settling: SettlingVoucher | null) {
  return useQuery({
    ...poolVouchersQueryOptions(clcApi.pools, address, VOUCHER_PAGE_SIZE),
    staleTime: VOUCHERS_STALE_TIME_MS,
    // Switched back on against the console default: an operator returning to a
    // pool they left open must not be shown the composition as it was then.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      if (!settling) return false;
      if (Date.now() > settling.deadline) return false;
      const vouchers = query.state.data?.vouchers ?? [];
      return hasVoucher(vouchers, settling.tokenAddress, settling) ? false : SETTLE_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

/** The voucher a just-signed transaction is expected to add, and until when. */
export type SettlingVoucher = {
  tokenAddress: string;
  deadline: number;
  expectedCapRaw?: string;
  expectedOracleAddress?: string;
};

export function settlingVoucher(
  tokenAddress: string,
  expected: Pick<SettlingVoucher, "expectedCapRaw" | "expectedOracleAddress"> = {},
): SettlingVoucher {
  return { tokenAddress, deadline: Date.now() + SETTLE_TIMEOUT_MS, ...expected };
}

/** Whether the projected composition has caught up with what was signed. */
export function hasVoucher(
  vouchers: PoolVoucher[],
  tokenAddress: string,
  expected?: Pick<SettlingVoucher, "expectedCapRaw" | "expectedOracleAddress">,
): boolean {
  const wanted = tokenAddress.toLowerCase();
  return vouchers.some(
    (voucher) =>
      voucher.tokenAddress.toLowerCase() === wanted &&
      (expected?.expectedCapRaw === undefined || voucher.tokenLimit === expected.expectedCapRaw) &&
      (expected?.expectedOracleAddress === undefined ||
        voucher.oracleAddress?.toLowerCase() === expected.expectedOracleAddress.toLowerCase()),
  );
}
