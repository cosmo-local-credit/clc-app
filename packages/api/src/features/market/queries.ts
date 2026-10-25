import type { NearbyRequest } from "@clc/core/features/catalog/nearby";
import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type {
  MarketBoundingBox,
  MarketClient,
  MarketReadOverrides,
  MarketVoucherPage,
} from "./client";

/**
 * Canonical query identity and base options for the voucher catalog.
 *
 * Every key hangs off `all`, so one `invalidateQueries({ queryKey: voucherKeys.all })`
 * after a voucher deploy reaches the list, the infinite catalog, viewport reads,
 * details, filtered results, facets and search.
 *
 * Freshness is deliberately absent: the public catalog is long-lived to a phone
 * and short-lived to an operator auditing it, so each app layers its own policy
 * over these options without touching the key or the query function.
 */
export type VoucherListParams = {
  perPage: number;
  cursor?: number;
  /** True steps forward from the cursor, false steps back. */
  next?: boolean;
};

/** One cursor page of the catalog as the backend filtered it. */
export type VoucherFilteredListParams = VoucherListParams & {
  filter: CatalogFilter;
  /** Only vouchers owned by this address. */
  owner?: string;
  pools?: readonly { chainId: number; address: string }[];
};

export const voucherKeys = {
  all: ["clc", "vouchers"] as const,

  /**
   * Finite and infinite reads cache different shapes, so they never share a key.
   *
   * Cursor and direction are keyed because they change which rows return. A sort
   * column is not: no endpoint accepts a sort, so ordering is applied to the
   * fetched page and re-sorting must not refetch.
   */
  list: (params: VoucherListParams) =>
    [
      "clc",
      "vouchers",
      "list",
      { perPage: params.perPage, cursor: params.cursor, next: params.next },
    ] as const,
  catalog: (perPage: number) => ["clc", "vouchers", "catalog", perPage] as const,

  /**
   * Viewport reads are keyed by the boxes themselves: panning produces a
   * different set of boxes and therefore a different result.
   */
  viewport: (boxes: ReadonlyArray<MarketBoundingBox>, perPage: number) =>
    ["clc", "vouchers", "viewport", { boxes, perPage }] as const,

  /**
   * Lowercased for cache identity only. A link may be pasted in any casing, and
   * the map card and the voucher page must share one entry so navigation lands
   * on data that is already there.
   */
  detail: (address: string) => ["clc", "vouchers", "detail", address.toLowerCase()] as const,

  filtered: (
    filter: CatalogFilter | null,
    perPage: number,
    pools?: readonly { chainId: number; address: string }[],
  ) =>
    [
      "clc",
      "vouchers",
      "filtered",
      {
        filter,
        perPage,
        pools: pools?.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`),
      },
    ] as const,

  /**
   * One page of a filtered list, as a paged table reads it — distinct from
   * `filtered`, which caches a whole assembled catalog.
   *
   * The filter is keyed alongside the cursor because it is a server parameter:
   * two terms are two different results, and a term applied after the fact to
   * whichever page happened to load is not a search of the catalog.
   */
  filteredPage: (params: VoucherFilteredListParams) =>
    [
      "clc",
      "vouchers",
      "filtered",
      "page",
      {
        filter: params.filter,
        owner: params.owner,
        pools: params.pools?.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`),
        perPage: params.perPage,
        cursor: params.cursor,
        next: params.next,
      },
    ] as const,
  facetVocabulary: () => ["clc", "vouchers", "facet-vocabulary"] as const,
  /**
   * `owner` narrows the lookup to one address's vouchers and is part of the key
   * because it is a server parameter: the same term answers differently with
   * and without it. Lower-cased so two casings of one address share an entry.
   */
  search: (term: string, owner?: string) =>
    ["clc", "vouchers", "search", term, owner?.toLowerCase() ?? null] as const,
} as const;

/**
 * Termination rule for the catalog cursor.
 *
 * Three ways to stop, and the third matters: a backend that returns the same or a
 * higher cursor than the previous page would otherwise page forever. This is a
 * property of the endpoint's cursor semantics, not of any one app, so it lives
 * here rather than in a caller.
 */
export function nextMarketCursor(perPage: number) {
  return (lastPage: MarketVoucherPage, allPages: MarketVoucherPage[]): number | undefined => {
    if (lastPage.receivedCount < perPage) return undefined;
    if (lastPage.last === 0) return undefined;
    const previous = allPages.at(-2);
    if (previous && lastPage.last >= previous.last) return undefined;
    return lastPage.last;
  };
}

/**
 * A paged, server-filtered catalog read.
 *
 * An unfiltered catalog query cannot answer a search: the term has to reach the
 * endpoint for the result to describe the catalog rather than the page in hand.
 * An empty term sends no `q`, so an unsearched table pays nothing for this.
 */
export function voucherFilteredPageQueryOptions(
  market: MarketClient,
  params: VoucherFilteredListParams,
) {
  return queryOptions({
    queryKey: voucherKeys.filteredPage(params),
    queryFn: ({ signal }) =>
      market.getFilteredMarketVouchers(
        {
          perPage: params.perPage,
          cursor: params.cursor,
          next: params.next,
          filter: params.filter,
          ...(params.owner ? { owner: params.owner } : {}),
          ...(params.pools ? { pools: params.pools } : {}),
        },
        signal,
      ),
    // Keeps the previous result visible while the next loads, so paging and
    // refining a term do not blink through an empty table.
    placeholderData: keepPreviousData,
  });
}

export function voucherCatalogInfiniteQueryOptions(
  market: MarketClient,
  perPage: number,
  nearby?: NearbyRequest,
) {
  return infiniteQueryOptions({
    queryKey: nearby?.scope
      ? ([...voucherKeys.catalog(perPage), nearby.scope] as const)
      : voucherKeys.catalog(perPage),
    queryFn: ({ pageParam, signal }) =>
      market.getMarketVouchers(
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
          ...(nearby?.nearby === true ? { nearby: true } : {}),
          ...(nearby?.bounds ? { bounds: nearby.bounds } : {}),
        },
        signal,
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextMarketCursor(perPage),
  });
}

/** One request per bounding box, flattened. Panning across the antimeridian yields two. */
export function voucherViewportQueryOptions(
  market: MarketClient,
  boxes: ReadonlyArray<MarketBoundingBox>,
  perPage: number,
  nearby?: NearbyRequest,
) {
  return queryOptions({
    queryKey: nearby?.scope
      ? ([...voucherKeys.viewport(boxes, perPage), nearby.scope] as const)
      : voucherKeys.viewport(boxes, perPage),
    queryFn: ({ signal }) =>
      market
        .getMarketVouchers(
          {
            perPage,
            bounds: boxes,
            ...(nearby?.nearby === true ? { nearby: true } : {}),
          },
          signal,
        )
        .then((page) => page.vouchers),
    enabled: boxes.length > 0,
  });
}

export function voucherQueryOptions(
  market: MarketClient,
  address: string | undefined,
  overrides?: MarketReadOverrides,
) {
  return queryOptions({
    queryKey: voucherKeys.detail(address ?? "none"),
    queryFn: ({ signal }) =>
      overrides
        ? market.getMarketVoucher(requireAddress(address), signal, overrides)
        : market.getMarketVoucher(requireAddress(address), signal),
    enabled: Boolean(address),
  });
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Voucher address is required.");
  return address;
}
