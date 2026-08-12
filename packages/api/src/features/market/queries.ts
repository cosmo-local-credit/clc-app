import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { MarketBoundingBox, MarketClient, MarketVoucherPage } from "./client";

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
export const voucherKeys = {
  all: ["clc", "vouchers"] as const,

  /** Finite and infinite reads cache different shapes, so they never share a key. */
  list: (perPage: number) => ["clc", "vouchers", "list", perPage] as const,
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

  filtered: (filter: CatalogFilter | null, perPage: number) =>
    ["clc", "vouchers", "filtered", { filter, perPage }] as const,
  facetVocabulary: () => ["clc", "vouchers", "facet-vocabulary"] as const,
  search: (term: string) => ["clc", "vouchers", "search", term] as const,
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

export function voucherListQueryOptions(market: MarketClient, perPage: number) {
  return queryOptions({
    queryKey: voucherKeys.list(perPage),
    queryFn: ({ signal }) => market.getMarketVouchers({ perPage }, signal),
    placeholderData: keepPreviousData,
  });
}

export function voucherCatalogInfiniteQueryOptions(market: MarketClient, perPage: number) {
  return infiniteQueryOptions({
    queryKey: voucherKeys.catalog(perPage),
    queryFn: ({ pageParam, signal }) =>
      market.getMarketVouchers(
        { perPage, cursor: pageParam, next: pageParam === undefined ? undefined : true },
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
) {
  return queryOptions({
    queryKey: voucherKeys.viewport(boxes, perPage),
    queryFn: async ({ signal }) => {
      const pages = await Promise.all(
        boxes.map((bbox) => market.getMarketVouchers({ perPage, bbox }, signal)),
      );
      return pages.flatMap((entry) => entry.vouchers);
    },
    enabled: boxes.length > 0,
  });
}

export function voucherQueryOptions(market: MarketClient, address: string | undefined) {
  return queryOptions({
    queryKey: voucherKeys.detail(address ?? "none"),
    queryFn: ({ signal }) => market.getMarketVoucher(requireAddress(address), signal),
    enabled: Boolean(address),
  });
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Voucher address is required.");
  return address;
}
