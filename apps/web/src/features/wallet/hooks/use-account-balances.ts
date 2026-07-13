import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getAccountTokens,
  getAccountTransfers,
  getLatestAccountTokens,
} from "#/features/wallet/api/account-client";

const DEFAULT_PAGE_SIZE = 20;
const WALLET_ACCOUNT_STALE_TIME_MS = 4_000;
const WALLET_ACCOUNT_REFETCH_INTERVAL_MS = 5_000;

const walletAccountQueryFreshness = {
  staleTime: WALLET_ACCOUNT_STALE_TIME_MS,
  refetchInterval: WALLET_ACCOUNT_REFETCH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
} as const;

export const accountWalletQueryKeys = {
  all: ["account-wallet"] as const,
  latestTokens: (address: string | undefined) =>
    [...accountWalletQueryKeys.all, normalizeAddress(address), "tokens", "latest"] as const,
  tokens: (address: string | undefined, perPage: number) =>
    [...accountWalletQueryKeys.all, normalizeAddress(address), "tokens", { perPage }] as const,
  transfers: (address: string | undefined, perPage: number) =>
    [...accountWalletQueryKeys.all, normalizeAddress(address), "transfers", { perPage }] as const,
};

export function useLatestAccountTokens(address: string | undefined) {
  return useQuery({
    queryKey: accountWalletQueryKeys.latestTokens(address),
    queryFn: () => getLatestAccountTokens(requireAddress(address)),
    enabled: !!address,
    ...walletAccountQueryFreshness,
  });
}

export function useAccountTokensInfinite(address: string | undefined, perPage = DEFAULT_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: accountWalletQueryKeys.tokens(address, perPage),
    queryFn: ({ pageParam }) =>
      getAccountTokens({
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
  });
}

export function useAccountTransfersInfinite(
  address: string | undefined,
  perPage = DEFAULT_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: accountWalletQueryKeys.transfers(address, perPage),
    queryFn: ({ pageParam }) =>
      getAccountTransfers({
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
  });
}

function normalizeAddress(address: string | undefined): string {
  return address?.toLowerCase() ?? "none";
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Wallet address is required.");
  return address;
}
