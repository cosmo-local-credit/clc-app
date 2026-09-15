import { type CatalogFilter, EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { PoolsClient, UserPoolPage } from "./client";

/**
 * Canonical query identity and base options for pool resources.
 *
 * Keys live beside the client that produces the data so one endpoint cannot end
 * up with two competing key shapes. Apps layer their own freshness policy over
 * these options without changing the key or the query function — the same pool
 * list means something different to a phone browsing a catalog and to an
 * operator auditing one.
 *
 * Every key hangs off `all`, so one `invalidateQueries({ queryKey: poolKeys.all })`
 * after a deploy reaches lists, details, vouchers, filtered results and facets.
 */
export type PoolListParams = {
  perPage: number;
  cursor?: number;
  /** True steps forward from the cursor, false steps back. */
  next?: boolean;
};

/** One cursor page of the pool list as the backend filtered it. */
export type PoolFilteredListParams = PoolListParams & { filter: CatalogFilter };

export const poolKeys = {
  all: ["clc", "pools"] as const,

  /**
   * Finite and infinite reads of the same endpoint get distinct keys: one caches
   * a single page, the other caches `{ pages, pageParams }`. Sharing a key would
   * let one shape be read as the other.
   *
   * Cursor and direction are part of the key because they change which rows come
   * back. A sort column is deliberately *not*: no endpoint accepts a sort, so
   * ordering is applied to the fetched page and re-sorting must not refetch.
   */
  list: (params: PoolListParams) =>
    [
      "clc",
      "pools",
      "list",
      { perPage: params.perPage, cursor: params.cursor, next: params.next },
    ] as const,
  listInfinite: (perPage: number) => ["clc", "pools", "list", "infinite", perPage] as const,

  detail: (address: string) => ["clc", "pools", "detail", address.toLowerCase()] as const,

  vouchers: (address: string, perPage: number) =>
    ["clc", "pools", "vouchers", address.toLowerCase(), perPage] as const,
  vouchersInfinite: (address: string, perPage: number) =>
    ["clc", "pools", "vouchers", "infinite", address.toLowerCase(), perPage] as const,

  /**
   * Filtered reads are keyed here so invalidation reaches them, but their
   * multi-page assembly and page budget stay in the app that needs them.
   */
  filtered: (filter: CatalogFilter | null, perPage: number) =>
    ["clc", "pools", "filtered", { filter, perPage }] as const,

  /**
   * One page of a filtered list, as a paged table reads it — distinct from
   * `filtered`, which caches a whole assembled catalog.
   *
   * The filter is keyed alongside the cursor because it is a server parameter:
   * two terms are two different results, and a term applied after the fact to
   * whichever page happened to load is not a search of the resource.
   */
  filteredPage: (params: PoolFilteredListParams) =>
    [
      "clc",
      "pools",
      "filtered",
      "page",
      {
        filter: params.filter,
        perPage: params.perPage,
        cursor: params.cursor,
        next: params.next,
      },
    ] as const,
  /**
   * The pools one address owns, as an infinite list.
   *
   * Distinct from `account`: that key holds one page of the pools an account is a
   * *member* of, which is a different set — an address can hold a pool's vouchers
   * without having deployed it, and can own a pool it holds nothing of.
   */
  ownedInfinite: (owner: string, perPage: number) =>
    ["clc", "pools", "owned", "infinite", owner.toLowerCase(), perPage] as const,

  /** One page of the pools an account belongs to. */
  account: (address: string, params: PoolListParams) =>
    [
      "clc",
      "pools",
      "account",
      address.toLowerCase(),
      { perPage: params.perPage, cursor: params.cursor, next: params.next },
    ] as const,
  facetVocabulary: () => ["clc", "pools", "facet-vocabulary"] as const,
} as const;

/** Termination rule for every cursor sequence over pools. */
function nextPoolCursor(page: UserPoolPage, perPage: number): number | undefined {
  return page.receivedCount < perPage || page.last === undefined ? undefined : page.last;
}

export function poolListInfiniteQueryOptions(pools: PoolsClient, perPage: number) {
  return infiniteQueryOptions({
    queryKey: poolKeys.listInfinite(perPage),
    queryFn: ({ pageParam, signal }) =>
      pools.getPools(
        { perPage, cursor: pageParam, next: pageParam === undefined ? undefined : true },
        signal,
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => nextPoolCursor(lastPage, perPage),
  });
}

/**
 * The pools an address owns.
 *
 * Goes through the filtered endpoint because `owner` is a server predicate
 * there: filtering a fetched page client-side would show "your pools" as
 * whatever of them happened to land in the first page of a catalog that grows
 * without bound.
 *
 * The filter is otherwise empty — this list carries no search box — so `owner`
 * is the only narrowing the request sends.
 */
export function poolsByOwnerInfiniteQueryOptions(
  pools: PoolsClient,
  owner: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: poolKeys.ownedInfinite(owner ?? "none", perPage),
    queryFn: ({ pageParam, signal }) =>
      pools.getFilteredPools(
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
          filter: EMPTY_CATALOG_FILTER,
          owner: requireAddress(owner),
        },
        signal,
      ),
    enabled: Boolean(owner),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => nextPoolCursor(lastPage, perPage),
  });
}

/**
 * A paged, server-filtered pool read.
 *
 * An unfiltered pool query cannot answer a search: the term has to reach the
 * endpoint for the result to describe the resource rather than the page in hand.
 * An empty term sends no `q`, so an unsearched table pays nothing for this.
 */
export function poolFilteredPageQueryOptions(pools: PoolsClient, params: PoolFilteredListParams) {
  return queryOptions({
    queryKey: poolKeys.filteredPage(params),
    queryFn: ({ signal }) =>
      pools.getFilteredPools(
        {
          perPage: params.perPage,
          cursor: params.cursor,
          next: params.next,
          filter: params.filter,
        },
        signal,
      ),
    // Keeps the previous result visible while the next loads, so paging and
    // refining a term do not blink through an empty table.
    placeholderData: keepPreviousData,
  });
}

export function poolFilteredQueryOptions(
  pools: PoolsClient,
  filter: CatalogFilter,
  perPage: number,
) {
  return queryOptions({
    queryKey: poolKeys.filtered(filter, perPage),
    queryFn: ({ signal }) => pools.getFilteredPools({ filter, perPage }, signal),
    placeholderData: keepPreviousData,
  });
}

export function poolQueryOptions(pools: PoolsClient, address: string | undefined) {
  return queryOptions({
    queryKey: poolKeys.detail(address ?? "none"),
    queryFn: ({ signal }) => pools.getPoolByAddress(requireAddress(address), signal),
    enabled: Boolean(address),
  });
}

export function poolVouchersQueryOptions(
  pools: PoolsClient,
  address: string | undefined,
  perPage: number,
) {
  return queryOptions({
    queryKey: poolKeys.vouchers(address ?? "none", perPage),
    queryFn: ({ signal }) => pools.getPoolVouchers(requireAddress(address), { perPage }, signal),
    enabled: Boolean(address),
    placeholderData: keepPreviousData,
  });
}

export function poolVouchersInfiniteQueryOptions(
  pools: PoolsClient,
  address: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: poolKeys.vouchersInfinite(address ?? "none", perPage),
    queryFn: ({ pageParam, signal }) =>
      pools.getPoolVouchers(
        requireAddress(address),
        { perPage, cursor: pageParam, next: pageParam === undefined ? undefined : true },
        signal,
      ),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.vouchers.length < perPage || lastPage.last === undefined ? undefined : lastPage.last,
  });
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Pool address is required.");
  return address;
}
