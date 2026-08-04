import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { BackendApiError } from "#/features/auth/api/client";
import {
  type FilteredMarketVoucherPage,
  type MarketTagFacet,
  type MarketVoucher,
  getFilteredMarketVouchers,
} from "#/features/home/api/market-client";
import {
  MARKET_MAP_PAGE_SIZE,
  MARKET_QUERY_FRESHNESS,
  marketVoucherQueryKeys,
  nextMarketCursor,
} from "#/features/home/hooks/use-market-vouchers";

export const MAX_FILTERED_PAGES = 6;

const FILTERED_GC_TIME = 5 * 60_000;

export class FilteredCatalogTooLargeError extends Error {
  constructor(readonly pagesWalked: number) {
    super(`The filtered catalog exceeded ${pagesWalked} pages.`);
    this.name = "FilteredCatalogTooLargeError";
  }
}

export type FilteredMarketCatalog = {
  vouchers: MarketVoucher[];
  tagFacets: MarketTagFacet[] | null;
};

export type FilteredCatalogState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "refining"; data: FilteredMarketCatalog }
  | { status: "ready"; data: FilteredMarketCatalog }
  | { status: "error"; error: Error };

export function useFilteredMarketVouchers(
  filter: CatalogFilter | null,
  perPage = MARKET_MAP_PAGE_SIZE,
) {
  const query = useQuery({
    queryKey: marketVoucherQueryKeys.filtered(filter, perPage),
    queryFn: async ({ signal }): Promise<FilteredMarketCatalog> => {
      if (!filter) throw new Error("The filtered catalog query ran without a filter.");

      const pages: FilteredMarketVoucherPage[] = [];
      let cursor: number | undefined;

      for (let index = 0; index < MAX_FILTERED_PAGES; index++) {
        const page = await getFilteredMarketVouchers(
          {
            perPage,
            cursor,
            next: cursor === undefined ? undefined : true,
            filter,
            facets: index === 0,
          },
          signal,
        );
        pages.push(page);
        cursor = nextMarketCursor(perPage)(page, pages);
        if (cursor === undefined) break;
      }

      if (cursor !== undefined) throw new FilteredCatalogTooLargeError(pages.length);

      const byId = new Map<string, MarketVoucher>();
      for (const page of pages) {
        for (const voucher of page.vouchers) byId.set(voucher.id, voucher);
      }

      return { vouchers: [...byId.values()], tagFacets: pages[0]?.tagFacets ?? null };
    },
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    staleTime: MARKET_QUERY_FRESHNESS.staleTime,
    refetchOnReconnect: MARKET_QUERY_FRESHNESS.refetchOnReconnect,
    gcTime: FILTERED_GC_TIME,
    retry: (failureCount, error) => {
      if (error instanceof FilteredCatalogTooLargeError) return false;
      if (error instanceof BackendApiError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
  });

  return query;
}

export function useMarketFacetVocabulary(enabled: boolean) {
  return useQuery({
    queryKey: marketVoucherQueryKeys.facetVocabulary(),
    queryFn: async ({ signal }) => {
      const page = await getFilteredMarketVouchers(
        { perPage: 1, filter: EMPTY_CATALOG_FILTER, facets: true },
        signal,
      );
      return page.tagFacets ?? [];
    },
    enabled,
    staleTime: MARKET_QUERY_FRESHNESS.staleTime,
    refetchOnReconnect: MARKET_QUERY_FRESHNESS.refetchOnReconnect,
    gcTime: FILTERED_GC_TIME,
    retry: (failureCount, error) =>
      error instanceof BackendApiError && error.status >= 400 && error.status < 500
        ? false
        : failureCount < 1,
  });
}

const EMPTY_CATALOG_FILTER: CatalogFilter = {
  term: "",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

export function ensureSelectedFacets(
  facets: MarketTagFacet[],
  selected: readonly string[],
): MarketTagFacet[] {
  const missing = selected.filter((tag) => !facets.some((facet) => facet.tag === tag));
  if (missing.length === 0) return facets;

  return [...facets, ...missing.map((tag) => ({ tag, count: 0 }))].sort((left, right) =>
    left.tag.localeCompare(right.tag),
  );
}

export function toFilteredCatalogState(
  query: ReturnType<typeof useFilteredMarketVouchers>,
  isDebouncing: boolean,
): FilteredCatalogState {
  if (!query.isEnabled) return { status: "disabled" };
  if (query.error) return { status: "error", error: query.error };
  if (query.data === undefined) return { status: "loading" };
  if (isDebouncing || query.isPlaceholderData) return { status: "refining", data: query.data };
  return { status: "ready", data: query.data };
}
