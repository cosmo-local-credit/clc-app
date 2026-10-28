import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  accountActivityInfiniteQueryOptions,
  accountIssuedTokensInfiniteQueryOptions,
  accountKeys,
  accountTokensInfiniteQueryOptions,
  accountTransfersInfiniteQueryOptions,
} from "@clc/api/features/accounts/queries";
import type { ActivityKind } from "@clc/api/features/accounts/client";
import { transientBackendReadQueryPolicy } from "@clc/api/client/errors";
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
    ...transientBackendReadQueryPolicy,
  });
}

/**
 * Every positive indexed token balance for an account.
 *
 * Eligibility and picker decisions must not mistake an older holding for zero.
 * This drains the cursor query and reports pending until the final page is
 * present, matching the complete-list contract used by pool voucher pickers.
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
    ...transientBackendReadQueryPolicy,
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
  {
    perPage = DEFAULT_PAGE_SIZE,
    poll = false,
    q = "",
    enabled = true,
  }: AccountPageQueryOptions & { q?: string; enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    ...accountTransfersInfiniteQueryOptions(accountsClient, address, perPage, q),
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
    enabled: Boolean(address) && enabled,
  });
}

export function useAccountActivityInfinite(
  address: string | undefined,
  {
    perPage = DEFAULT_PAGE_SIZE,
    poll = false,
    q = "",
    types = [],
    enabled = true,
  }: AccountPageQueryOptions & {
    q?: string;
    types?: readonly ActivityKind[];
    enabled?: boolean;
  } = {},
) {
  return useInfiniteQuery({
    ...accountActivityInfiniteQueryOptions(accountsClient, address, perPage, q, types),
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
    enabled: Boolean(address) && enabled,
  });
}

function normalizeAddress(address: string | undefined): string {
  return address?.toLowerCase() ?? "none";
}
