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

  /**
   * One cursor page of transfers, for a table that pages rather than one that
   * appends. Keyed on the cursor and direction because both change which rows come
   * back — the same cursor forwards and backwards addresses different pages.
   */
  transfersPage: (address: string, params: AccountTransfersPageParams) =>
    [
      "clc",
      "accounts",
      "transfers",
      "page",
      address.toLowerCase(),
      { perPage: params.perPage, cursor: params.cursor, next: params.next },
    ] as const,
} as const;

export type AccountTransfersPageParams = {
  perPage: number;
  cursor?: number;
  /** True steps forward from the cursor, false steps back. */
  next?: boolean;
};

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

/**
 * A paged transfers read for a cursor-paginated table.
 *
 * Distinct from the infinite read above, which caches `{ pages, pageParams }` for
 * a list that grows as it is scrolled. A table shows one page at a time and steps
 * in both directions, so it needs the single-page shape and a key that includes
 * the step.
 */
export function accountTransfersPageQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
  params: AccountTransfersPageParams,
) {
  return queryOptions({
    queryKey: accountKeys.transfersPage(address ?? "none", params),
    queryFn: () =>
      accounts.getAccountTransfers({
        address: requireAddress(address),
        perPage: params.perPage,
        cursor: params.cursor,
        next: params.next,
      }),
    enabled: Boolean(address),
    // Keeps the current page on screen while the next one loads, so paging does
    // not blink through an empty table.
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
