import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  accountKeys,
  accountTokensInfiniteQueryOptions,
  accountTransfersInfiniteQueryOptions,
} from "@clc/api/features/accounts/queries";
import { accountsClient } from "#/lib/api/accounts";

const DEFAULT_PAGE_SIZE = 20;
const WALLET_ACCOUNT_STALE_TIME_MS = 4_000;
const WALLET_ACCOUNT_REFETCH_INTERVAL_MS = 5_000;

/**
 * Shared freshness for every account read. Deliberately carries no interval:
 * a 5s poll belongs to the screens whose job is a continuously updating list,
 * not to every screen that merely needs a balance lookup (pool detail, send,
 * voucher detail, off-ramp), which would otherwise keep it running app-wide.
 */
const walletAccountQueryFreshness = {
  staleTime: WALLET_ACCOUNT_STALE_TIME_MS,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
} as const;

export type AccountPageQueryOptions = {
  perPage?: number;
  /** Hold the 5s poll open while mounted. Opt in per screen. */
  poll?: boolean;
};

function pollOptions(poll: boolean) {
  return {
    refetchInterval: poll ? WALLET_ACCOUNT_REFETCH_INTERVAL_MS : (false as const),
    refetchIntervalInBackground: false,
  };
}

/**
 * Re-exported so wallet callers keep one import for account identity. The keys
 * are canonical in @clc/api; only the polling policy above is app-specific.
 */
export const accountWalletQueryKeys = {
  all: accountKeys.all,
  tokens: (address: string | undefined, perPage: number) =>
    accountKeys.tokensInfinite(normalizeAddress(address), perPage),
  transfers: (address: string | undefined, perPage: number) =>
    accountKeys.transfersInfinite(normalizeAddress(address), perPage),
};

export function useAccountTokensInfinite(
  address: string | undefined,
  { perPage = DEFAULT_PAGE_SIZE, poll = false }: AccountPageQueryOptions = {},
) {
  return useInfiniteQuery({
    ...accountTokensInfiniteQueryOptions(accountsClient, address, perPage),
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
  });
}

/**
 * Every positive indexed token balance for an account.
 *
 * This drains the existing cursor query and reports pending until the final
 * page is present, so the Wallet cannot mistake an older holding for zero.
 */
export function useAllAccountTokens(
  address: string | undefined,
  { poll = false }: Pick<AccountPageQueryOptions, "poll"> = {},
) {
  const query = useAccountTokensInfinite(address, { perPage: 100, poll });
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = query;

  useEffect(() => {
    if (isError || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage]);

  return {
    ...query,
    tokens: query.data?.pages.flatMap((page) => page.tokens) ?? [],
    isPending: query.isPending || hasNextPage || isFetchingNextPage,
  };
}

export function useAccountTransfersInfinite(
  address: string | undefined,
  { perPage = DEFAULT_PAGE_SIZE, poll = false }: AccountPageQueryOptions = {},
) {
  return useInfiniteQuery({
    ...accountTransfersInfiniteQueryOptions(accountsClient, address, perPage),
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
  });
}

function normalizeAddress(address: string | undefined): string {
  return address?.toLowerCase() ?? "none";
}
