import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AccountsClient, ActivityKind } from "./client";

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
  issuedTokensInfinite: (address: string, perPage: number) =>
    ["clc", "accounts", "tokens", "issued", "infinite", address.toLowerCase(), perPage] as const,

  transfers: (address: string, perPage: number) =>
    ["clc", "accounts", "transfers", address.toLowerCase(), perPage] as const,
  transfersInfinite: (address: string, perPage: number, q = "") =>
    [
      "clc",
      "accounts",
      "transfers",
      "infinite",
      address.toLowerCase(),
      perPage,
      ...(q ? [q] : []),
    ] as const,
  activityInfinite: (
    address: string,
    perPage: number,
    q = "",
    types: readonly ActivityKind[] = [],
  ) =>
    [
      "clc",
      "accounts",
      "activity",
      "infinite",
      address.toLowerCase(),
      perPage,
      q,
      ...types,
    ] as const,
  /** Latest activity through the saved seen block, independent of the screen's pages. */
  activityLatest: (address: string, perPage: number, since?: string) =>
    [
      "clc",
      "accounts",
      "activity",
      "latest",
      address.toLowerCase(),
      perPage,
      since ?? null,
    ] as const,

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

export function accountIssuedTokensInfiniteQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: accountKeys.issuedTokensInfinite(address ?? "none", perPage),
    queryFn: ({ pageParam }) =>
      accounts.getAccountIssuedTokens({
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
  q = "",
) {
  return infiniteQueryOptions({
    queryKey: accountKeys.transfersInfinite(address ?? "none", perPage, q),
    queryFn: ({ pageParam, signal }) =>
      accounts.getAccountTransfers(
        {
          address: requireAddress(address),
          perPage,
          ...(q ? { q } : {}),
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.transfers.length < perPage || lastPage.last === undefined
        ? undefined
        : lastPage.last,
  });
}

export function accountActivityInfiniteQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
  perPage: number,
  q = "",
  types: readonly ActivityKind[] = [],
) {
  return infiniteQueryOptions({
    queryKey: accountKeys.activityInfinite(address ?? "none", perPage, q, types),
    queryFn: ({ pageParam, signal }) =>
      accounts.getAccountActivity(
        {
          address: requireAddress(address),
          perPage,
          ...(q ? { q } : {}),
          ...(types.length ? { types } : {}),
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.activity.length < perPage || lastPage.last === undefined ? undefined : lastPage.last,
  });
}

/**
 * Latest activity back through `since`, including every row in that block.
 *
 * Without a saved marker, only the first page is needed to establish a baseline.
 * Subsequent reads follow cursors until they pass the seen block or exhaust the
 * feed, so outgoing rows cannot push an unread receipt out of the count. This
 * window is independent of the Activity screen's loaded history and filters.
 */
export function accountActivityLatestQueryOptions(
  accounts: AccountsClient,
  address: string | undefined,
  perPage: number,
  since?: string,
) {
  return queryOptions({
    queryKey: accountKeys.activityLatest(address ?? "none", perPage, since),
    queryFn: async ({ signal }) => {
      const accountAddress = requireAddress(address);
      const first = await accounts.getAccountActivity({ address: accountAddress, perPage }, signal);
      if (!since) return first;

      const boundary = Date.parse(since);
      const activity = [...first.activity];
      const cursors = new Set<number>();
      let page = first;
      while (
        page.activity.length >= perPage &&
        page.last !== undefined &&
        page.activity.every((item) => Date.parse(item.dateBlock) >= boundary)
      ) {
        if (cursors.has(page.last)) throw new Error("Activity pagination did not advance.");
        cursors.add(page.last);
        page = await accounts.getAccountActivity(
          { address: accountAddress, perPage, cursor: page.last, next: true },
          signal,
        );
        activity.push(...page.activity);
      }
      return { ...first, activity, last: page.last };
    },
    enabled: Boolean(address),
  });
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Account address is required.");
  return address;
}
