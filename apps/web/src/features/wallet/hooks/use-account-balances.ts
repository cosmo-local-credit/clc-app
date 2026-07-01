import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getAccountTokens,
  getAccountTransfers,
  getLatestAccountTokens,
} from "#/features/wallet/api/account-client";

const DEFAULT_PAGE_SIZE = 20;

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
    staleTime: 120_000,
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
    staleTime: 120_000,
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
    staleTime: 120_000,
  });
}

function normalizeAddress(address: string | undefined): string {
  return address?.toLowerCase() ?? "none";
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Wallet address is required.");
  return address;
}
