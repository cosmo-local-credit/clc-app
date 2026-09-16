/**
 * Account reads for the detail screen, with this console's freshness policy.
 *
 * The same shape as `apps/web/src/features/wallet/hooks/use-account-balances.ts`,
 * and for the same reasons — the keys and query functions stay canonical in
 * `@clc/api`, and only the policy is app-specific. Two things follow from that
 * split, both of which the console's global defaults get wrong for chain data:
 *
 *   - `staleTime` is seconds, not the console default of two minutes. A balance
 *     changes when a transfer settles, with nobody on this screen doing anything.
 *   - Focus and reconnect refetches are switched back on. The console turns them
 *     off globally because an operator scanning between tables should not refire
 *     every list, but coming back to a balance an hour later must not show the
 *     hour-old figure.
 *
 * Polling is opt-in per read, again as in the phone app: `refetchInterval` runs
 * for as long as a query has an active observer and is independent of
 * `staleTime`, so a poll attached to a shared factory would keep firing on every
 * screen that merely looks a balance up. Only the screen whose job is the live
 * figure asks for it. `refetchIntervalInBackground` stays false — react-query's
 * default — so a console left open on another tab is not polling all afternoon.
 */

import {
  type AccountTransfersPageParams,
  accountTransfersPageQueryOptions,
  latestAccountTokensQueryOptions,
} from "@clc/api/features/accounts/queries";
import { useQuery } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

const ACCOUNT_STALE_TIME_MS = 4_000;
const ACCOUNT_REFETCH_INTERVAL_MS = 5_000;

const accountQueryFreshness = {
  staleTime: ACCOUNT_STALE_TIME_MS,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
} as const;

function pollOptions(poll: boolean) {
  return {
    refetchInterval: poll ? ACCOUNT_REFETCH_INTERVAL_MS : (false as const),
    refetchIntervalInBackground: false,
  };
}

/** Backs the balances card, the one live figure on the account screen. */
export function useLatestAccountTokens(address: string) {
  return useQuery({
    ...latestAccountTokensQueryOptions(clcApi.accounts, address),
    ...accountQueryFreshness,
    ...pollOptions(true),
  });
}

/**
 * One page of transfers for the records tab. Not polled: a table an operator is
 * paging through should not reorder itself under them, and the page they are on is
 * a cursor into history rather than a live tail.
 */
export function useAccountTransfers(address: string, params: AccountTransfersPageParams) {
  return useQuery({
    ...accountTransfersPageQueryOptions(clcApi.accounts, address, params),
    ...accountQueryFreshness,
    ...pollOptions(false),
  });
}
