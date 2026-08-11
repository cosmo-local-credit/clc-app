import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AccountsClient } from "./client";

export const accountKeys = {
  all: ["clc", "accounts"] as const,
  latestTokens: (address: string) =>
    ["clc", "accounts", "tokens", "latest", address.toLowerCase()] as const,
  tokens: (address: string, perPage: number) =>
    ["clc", "accounts", "tokens", address.toLowerCase(), perPage] as const,
  transfers: (address: string, perPage: number) =>
    ["clc", "accounts", "transfers", address.toLowerCase(), perPage] as const,
} as const;

export function latestAccountTokensQueryOptions(accounts: AccountsClient, address: string) {
  return queryOptions({
    queryKey: accountKeys.latestTokens(address),
    queryFn: () => accounts.getLatestAccountTokens(address),
    enabled: address !== "",
  });
}

export function accountTokensQueryOptions(
  accounts: AccountsClient,
  address: string,
  perPage: number,
) {
  return queryOptions({
    queryKey: accountKeys.tokens(address, perPage),
    queryFn: () => accounts.getAccountTokens({ address, perPage }),
    enabled: address !== "",
    placeholderData: keepPreviousData,
  });
}

export function accountTransfersQueryOptions(
  accounts: AccountsClient,
  address: string,
  perPage: number,
) {
  return queryOptions({
    queryKey: accountKeys.transfers(address, perPage),
    queryFn: () => accounts.getAccountTransfers({ address, perPage }),
    enabled: address !== "",
    placeholderData: keepPreviousData,
  });
}
