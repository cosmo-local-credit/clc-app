import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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

export const accountWalletQueryKeys = {
  all: ["account-wallet"] as const,
  latestTokens: (address: string | undefined) =>
    [...accountWalletQueryKeys.all, normalizeAddress(address), "tokens", "latest"] as const,
  tokens: (address: string | undefined, perPage: number) =>
    [...accountWalletQueryKeys.all, normalizeAddress(address), "tokens", { perPage }] as const,
  transfers: (address: string | undefined, perPage: number) =>
    [...accountWalletQueryKeys.all, normalizeAddress(address), "transfers", { perPage }] as const,
};

/** Backs the wallet screen's "Your Vouchers" list — the one live balance poll. */
export function useLatestAccountTokens(address: string | undefined) {
  return useQuery({
    queryKey: accountWalletQueryKeys.latestTokens(address),
    queryFn: () => clcApi.accounts.getLatestAccountTokens(requireAddress(address)),
    enabled: !!address,
    ...walletAccountQueryFreshness,
    ...pollOptions(true),
  });
}

export function useAccountTokensInfinite(
  address: string | undefined,
  { perPage = DEFAULT_PAGE_SIZE, poll = false }: AccountPageQueryOptions = {},
) {
  return useInfiniteQuery({
    queryKey: accountWalletQueryKeys.tokens(address, perPage),
    queryFn: ({ pageParam }) =>
      clcApi.accounts.getAccountTokens({
        address: requireAddress(address),
        perPage,
        cursor: pageParam,
        next: pageParam === undefined ? undefined : true,
      }),
    enabled: !!address,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.tokens.length < perPage || lastPage.last === undefined ? undefined : lastPage.last,
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
  });
}

export function useAccountTransfersInfinite(
  address: string | undefined,
  { perPage = DEFAULT_PAGE_SIZE, poll = false }: AccountPageQueryOptions = {},
) {
  return useInfiniteQuery({
    queryKey: accountWalletQueryKeys.transfers(address, perPage),
    queryFn: ({ pageParam }) =>
      clcApi.accounts.getAccountTransfers({
        address: requireAddress(address),
        perPage,
        cursor: pageParam,
        next: pageParam === undefined ? undefined : true,
      }),
    enabled: !!address,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.transfers.length < perPage || lastPage.last === undefined
        ? undefined
        : lastPage.last,
    ...walletAccountQueryFreshness,
    ...pollOptions(poll),
  });
}

function normalizeAddress(address: string | undefined): string {
  return address?.toLowerCase() ?? "none";
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Wallet address is required.");
  return address;
}
