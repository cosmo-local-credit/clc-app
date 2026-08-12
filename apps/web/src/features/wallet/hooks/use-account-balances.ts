import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  accountKeys,
  accountTokensInfiniteQueryOptions,
  accountTransfersInfiniteQueryOptions,
  latestAccountTokensQueryOptions,
} from "@clc/api/features/accounts/queries";
import { clcApi } from "#/lib/api";

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

/** Backs the wallet screen's "Your Vouchers" list — the one live balance poll. */
export function useLatestAccountTokens(address: string | undefined) {
  return useQuery({
    ...latestAccountTokensQueryOptions(clcApi.accounts, address),
    ...walletAccountQueryFreshness,
    ...pollOptions(true),
  });
}

export function useAccountTokensInfinite(
  address: string | undefined,
  { perPage = DEFAULT_PAGE_SIZE, poll = false }: AccountPageQueryOptions = {},
) {
  return useInfiniteQuery({
    ...accountTokensInfiniteQueryOptions(clcApi.accounts, address, perPage),
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
  });
}

export function useAccountTransfersInfinite(
  address: string | undefined,
  { perPage = DEFAULT_PAGE_SIZE, poll = false }: AccountPageQueryOptions = {},
) {
  return useInfiniteQuery({
    ...accountTransfersInfiniteQueryOptions(clcApi.accounts, address, perPage),
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
  });
}

function normalizeAddress(address: string | undefined): string {
  return address?.toLowerCase() ?? "none";
}
