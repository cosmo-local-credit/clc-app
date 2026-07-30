import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { BackendApiError } from "#/features/auth/api/client";
import {
  type FilteredPoolPage,
  type PoolTagFacet,
  type UserPool,
  getFilteredPools,
} from "#/features/pools/api/pools-client";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const POOLS_FILTER_PAGE_SIZE = 100;

const MAX_FILTERED_POOL_PAGES = 10;

const FILTERED_POOLS_GC_TIME = 5 * 60_000;
const POOLS_STALE_TIME = 10 * 60_000;

const EMPTY_CATALOG_FILTER: CatalogFilter = { term: "", tags: [], tagMatch: "any" };

const filteredPoolQueryKeys = {
  all: ["pools"] as const,
  filtered: (filter: CatalogFilter | null, perPage: number) =>
    [...filteredPoolQueryKeys.all, "filtered", { filter, perPage }] as const,
  facetVocabulary: () => [...filteredPoolQueryKeys.all, "facet-vocabulary"] as const,
};

export class FilteredPoolsTooLargeError extends Error {
  constructor(readonly pagesWalked: number) {
    super(`The filtered pool catalog exceeded ${pagesWalked} pages.`);
    this.name = "FilteredPoolsTooLargeError";
  }
}

type FilteredPoolCatalog = {
  pools: UserPool[];
  tagFacets: PoolTagFacet[] | null;
};

type FilteredPoolsState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "refining"; data: FilteredPoolCatalog }
  | { status: "ready"; data: FilteredPoolCatalog }
  | { status: "error"; error: Error };

function nextPoolCursor(perPage: number) {
  return (lastPage: FilteredPoolPage, allPages: FilteredPoolPage[]): number | undefined => {
    if (lastPage.receivedCount < perPage) return undefined;
    if (lastPage.last === undefined || lastPage.last === 0) return undefined;
    const previous = allPages.at(-2);
    if (previous?.last !== undefined && lastPage.last >= previous.last) return undefined;
    return lastPage.last;
  };
}

function useFilteredPools(filter: CatalogFilter | null, perPage = POOLS_FILTER_PAGE_SIZE) {
  return useQuery({
    queryKey: filteredPoolQueryKeys.filtered(filter, perPage),
    queryFn: async ({ signal }): Promise<FilteredPoolCatalog> => {
      if (!filter) throw new Error("The filtered pools query ran without a filter.");

      const pages: FilteredPoolPage[] = [];
      let cursor: number | undefined;

      for (let index = 0; index < MAX_FILTERED_POOL_PAGES; index++) {
        const page = await getFilteredPools(
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
        cursor = nextPoolCursor(perPage)(page, pages);
        if (cursor === undefined) break;
      }

      if (cursor !== undefined) throw new FilteredPoolsTooLargeError(pages.length);

      const byAddress = new Map<string, UserPool>();
      for (const page of pages) {
        for (const pool of page.pools) byAddress.set(pool.address, pool);
      }

      return { pools: [...byAddress.values()], tagFacets: pages[0]?.tagFacets ?? null };
    },
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    staleTime: POOLS_STALE_TIME,
    gcTime: FILTERED_POOLS_GC_TIME,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof FilteredPoolsTooLargeError) return false;
      if (error instanceof BackendApiError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

function usePoolFacetVocabulary() {
  return useQuery({
    queryKey: filteredPoolQueryKeys.facetVocabulary(),
    queryFn: async ({ signal }) => {
      const page = await getFilteredPools(
        { perPage: 1, filter: EMPTY_CATALOG_FILTER, facets: true },
        signal,
      );
      return page.tagFacets ?? [];
    },
    staleTime: POOLS_STALE_TIME,
    gcTime: FILTERED_POOLS_GC_TIME,
    refetchOnReconnect: false,
    retry: (failureCount, error) =>
      error instanceof BackendApiError && error.status >= 400 && error.status < 500
        ? false
        : failureCount < 1,
  });
}

function ensureSelectedPoolFacets(
  facets: PoolTagFacet[],
  selected: readonly string[],
): PoolTagFacet[] {
  const missing = selected.filter((tag) => !facets.some((facet) => facet.tag === tag));
  if (missing.length === 0) return facets;
  return [...facets, ...missing.map((tag) => ({ tag, count: 0 }))].sort((left, right) =>
    left.tag.localeCompare(right.tag),
  );
}

export type PoolCatalog = {
  pools: UserPool[];
  status: "loading" | "refining" | "ready" | "error";
  error: Error | null;
  retry: () => void;
  tagFacets: PoolTagFacet[];
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
};

export function usePoolCatalog(
  filter: CatalogFilterControls,
  unfiltered: {
    pools: UserPool[];
    isPending: boolean;
    error: Error | null;
    retry: () => void;
    hasNextPage: boolean;
    fetchNextPage: () => void;
    isFetchingNextPage: boolean;
  },
): PoolCatalog {
  const filtered = useFilteredPools(filter.isFiltered ? filter.filter : null);
  const vocabulary = usePoolFacetVocabulary();

  const state: FilteredPoolsState = useMemo(() => {
    if (!filtered.isEnabled) return { status: "disabled" };
    if (filtered.error) return { status: "error", error: filtered.error };
    if (filtered.data === undefined) return { status: "loading" };
    if (filter.isDebouncing || filtered.isPlaceholderData) {
      return { status: "refining", data: filtered.data };
    }
    return { status: "ready", data: filtered.data };
  }, [
    filtered.isEnabled,
    filtered.error,
    filtered.data,
    filtered.isPlaceholderData,
    filter.isDebouncing,
  ]);

  const chipFacets = useMemo(() => {
    const selected = filter.result.ok ? filter.result.filter.tags : [];
    const source =
      (state.status === "refining" || state.status === "ready" ? state.data.tagFacets : null) ??
      vocabulary.data;
    return ensureSelectedPoolFacets(source ?? [], selected);
  }, [filter.result, state, vocabulary.data]);

  return useMemo(() => {
    if (!filter.isFiltered) {
      return {
        pools: unfiltered.pools,
        status: unfiltered.error ? "error" : unfiltered.isPending ? "loading" : "ready",
        error: unfiltered.error,
        retry: unfiltered.retry,
        tagFacets: chipFacets,
        hasMore: unfiltered.hasNextPage,
        loadMore: unfiltered.fetchNextPage,
        isLoadingMore: unfiltered.isFetchingNextPage,
      };
    }

    const data = state.status === "refining" || state.status === "ready" ? state.data : null;

    return {
      pools: data?.pools ?? [],
      status: state.status === "disabled" ? "ready" : state.status,
      error: state.status === "error" ? state.error : null,
      retry: () => void filtered.refetch(),
      tagFacets: chipFacets,
      hasMore: false,
      loadMore: () => {},
      isLoadingMore: false,
    };
  }, [filter.isFiltered, unfiltered, state, chipFacets, filtered]);
}
