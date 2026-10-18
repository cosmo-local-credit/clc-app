import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  accountIssuedTokensInfiniteQueryOptions,
  accountKeys,
  accountTokensInfiniteQueryOptions,
  accountTransfersInfiniteQueryOptions,
  latestAccountTokensQueryOptions,
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
  latestTokens: (address: string | undefined) =>
    accountKeys.latestTokens(normalizeAddress(address)),
  tokens: (address: string | undefined, perPage: number) =>
    accountKeys.tokensInfinite(normalizeAddress(address), perPage),
  transfers: (address: string | undefined, perPage: number) =>
    accountKeys.transfersInfinite(normalizeAddress(address), perPage),
};

/** Backs the wallet balance list — the one live balance poll. The screen splits it. */
export function useLatestAccountTokens(address: string | undefined) {
  return useQuery({
    ...latestAccountTokensQueryOptions(accountsClient, address),
    ...walletAccountQueryFreshness,
    ...pollOptions(true),
  });
}

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
 * The wallet home deliberately uses the five-token `latest` endpoint, while
 * eligibility and picker decisions must not mistake an older holding for zero.
 * This drains the existing cursor query and reports pending until the final
 * page is present, matching the complete-list contract used by pool voucher
 * pickers.
 */
export function useAllAccountTokens(address: string | undefined) {
  const query = useAccountTokensInfinite(address, { perPage: 100 });
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

/**
 * Every catalog voucher an account owns, with its balance of each, zero
 * included. Drained like `useAllAccountTokens`: the wallet files a balance
 * under Holdings by its absence from this list, so a partial list would call
 * the viewer's own voucher someone else's. It polls with the balance list it
 * splits, so an issued voucher's amount moves with everything else.
 */
export function useAllAccountIssuedTokens(address: string | undefined) {
  const query = useInfiniteQuery({
    ...accountIssuedTokensInfiniteQueryOptions(accountsClient, address, 100),
    ...walletAccountQueryFreshness,
    ...pollOptions(true),
  });
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
