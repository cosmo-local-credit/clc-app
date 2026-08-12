import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AccountsClient } from "./client";

/**
 * Canonical query identity and base options for account reads.
 *
 * Addresses are lowercased so one account has one cache entry regardless of the
 * casing a caller happens to hold — a checksummed address from the chain and a
 * lowercased one from a URL must not produce two.
 *
 * Polling is deliberately absent. The wallet screen polls one balance list while
 * visible; an operator auditing the same account does not. Each app layers that
 * over these options.
 */
export const accountKeys = {
  all: ["clc", "accounts"] as const,

  latestTokens: (address: string) =>
    ["clc", "accounts", "tokens", "latest", address.toLowerCase()] as const,

  /** Finite and infinite reads cache different shapes, so they never share a key. */
  tokens: (address: string, perPage: number) =>
    ["clc", "accounts", "tokens", address.toLowerCase(), perPage] as const,
  tokensInfinite: (address: string, perPage: number) =>
    ["clc", "accounts", "tokens", "infinite", address.toLowerCase(), perPage] as const,

  transfers: (address: string, perPage: number) =>
    ["clc", "accounts", "transfers", address.toLowerCase(), perPage] as const,
  transfersInfinite: (address: string, perPage: number) =>
    ["clc", "accounts", "transfers", "infinite", address.toLowerCase(), perPage] as const,
} as const;

export function latestAccountTokensQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
) {
  return queryOptions({
    queryKey: accountKeys.latestTokens(address ?? "none"),
    queryFn: () => accounts.getLatestAccountTokens(requireAddress(address)),
    enabled: Boolean(address),
  });
}

export function accountTokensInfiniteQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: accountKeys.tokensInfinite(address ?? "none", perPage),
    queryFn: ({ pageParam }) =>
      accounts.getAccountTokens({
        address: requireAddress(address),
        perPage,
        cursor: pageParam,
        next: pageParam === undefined ? undefined : true,
      }),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.tokens.length < perPage || lastPage.last === undefined ? undefined : lastPage.last,
  });
}

export function accountTransfersQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
  perPage: number,
) {
  return queryOptions({
    queryKey: accountKeys.transfers(address ?? "none", perPage),
    queryFn: () => accounts.getAccountTransfers({ address: requireAddress(address), perPage }),
    enabled: Boolean(address),
    placeholderData: keepPreviousData,
  });
}

export function accountTransfersInfiniteQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: accountKeys.transfersInfinite(address ?? "none", perPage),
    queryFn: ({ pageParam }) =>
      accounts.getAccountTransfers({
        address: requireAddress(address),
        perPage,
        cursor: pageParam,
        next: pageParam === undefined ? undefined : true,
      }),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.transfers.length < perPage || lastPage.last === undefined
        ? undefined
        : lastPage.last,
  });
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Account address is required.");
  return address;
}
