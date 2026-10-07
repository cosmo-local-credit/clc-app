import {
  filterNearbyCatalog,
  type NearbyCatalogFilter,
  useNearbyCatalog,
  useNearbyCatalogFilter,
  nearbyQueryKey,
  nearbyQueryPolicy,
} from "#/components/nearby-catalog";
import {
  type CatalogFilter,
  type VoucherRef,
  formatVoucherAddress,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { isRetryableBackendError } from "@clc/api/client/errors";
import { poolKeys } from "@clc/api/features/pools/queries";
import {
  type FilteredPoolPage,
  type PoolTagFacet,
  type PoolVoucherFacet,
  type UserPool,
} from "@clc/api/features/pools/client";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { poolsClient } from "#/lib/api/pools";

const POOLS_FILTER_PAGE_SIZE = 100;

const MAX_FILTERED_POOL_PAGES = 10;

const FILTERED_POOLS_GC_TIME = 5 * 60_000;
const POOLS_STALE_TIME = 10 * 60_000;

const EMPTY_CATALOG_FILTER: CatalogFilter = {
  term: "",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

// Identity is canonical in @clc/api so a pool invalidation reaches these too;
// the multi-page assembly and page budget below stay app-specific.
const filteredPoolQueryKeys = {
  filtered: poolKeys.filtered,
  facetVocabulary: poolKeys.facetVocabulary,
};

export class FilteredPoolsTooLargeError extends Error {
  constructor(readonly pagesWalked: number) {
    super(`The filtered pool catalog exceeded ${pagesWalked} pages.`);
    this.name = "FilteredPoolsTooLargeError";
  }
}

export type FilteredPoolCatalog = {
  pools: UserPool[];
  tagFacets: PoolTagFacet[] | null;
  voucherFacets: PoolVoucherFacet[] | null;
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

/**
 * Walk one server-filtered pool result to completion.
 *
 * Search, Credit candidate discovery, and any later complete catalog consumer
 * share the same cursor safety rules rather than each growing a subtly
 * different pagination loop.
 */
export async function fetchFilteredPoolCatalog({
  filter,
  facets = false,
  perPage = POOLS_FILTER_PAGE_SIZE,
  signal,
  nearby = false,
  visibilityFilter,
}: {
  filter: CatalogFilter;
  facets?: boolean;
  perPage?: number;
  signal?: AbortSignal;
  nearby?: boolean;
  visibilityFilter?: NearbyCatalogFilter;
}): Promise<FilteredPoolCatalog> {
  const pages: FilteredPoolPage[] = [];
  let cursor: number | undefined;

  for (let index = 0; index < MAX_FILTERED_POOL_PAGES; index++) {
    const page = await poolsClient.getFilteredPools(
      {
        ...(nearby ? { nearby } : {}),
        perPage,
        cursor,
        next: cursor === undefined ? undefined : true,
        filter,
        facets: facets && index === 0,
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
    for (const pool of page.pools) byAddress.set(pool.address.toLowerCase(), pool);
  }

  return {
    pools: filterNearbyCatalog(
      [...byAddress.values()].map((pool) => ({ ...pool, lat: pool.geoLat, lng: pool.geoLng })),
      visibilityFilter,
    ).map(({ lat: _lat, lng: _lng, ...pool }) => pool),
    tagFacets: pages[0]?.tagFacets ?? null,
    voucherFacets: pages[0]?.voucherFacets ?? null,
  };
}

function useFilteredPools(filter: CatalogFilter | null, perPage = POOLS_FILTER_PAGE_SIZE) {
  const nearby = useNearbyCatalog();
  const visibilityFilter = useNearbyCatalogFilter();
  return useQuery({
    queryKey: nearbyQueryKey(filteredPoolQueryKeys.filtered(filter, perPage), nearby),
    queryFn: ({ signal }): Promise<FilteredPoolCatalog> => {
      if (!filter) throw new Error("The filtered pools query ran without a filter.");
      return fetchFilteredPoolCatalog({
        filter,
        facets: true,
        perPage,
        signal,
        nearby: !!nearby,
        visibilityFilter,
      });
    },
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    staleTime: POOLS_STALE_TIME,
    gcTime: FILTERED_POOLS_GC_TIME,
    refetchOnReconnect: false,
    ...nearbyQueryPolicy(nearby),
    // Only a transport failure or server fault is worth replaying; a rejected
    // filter, an exhausted page budget, or a bug in our own query function
    // will fail identically. See isRetryableBackendError.
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });
}

export function usePoolFacetVocabulary(enabled: boolean) {
  const nearby = useNearbyCatalog();
  return useQuery({
    queryKey: nearbyQueryKey(filteredPoolQueryKeys.facetVocabulary(), nearby),
    queryFn: async ({ signal }) => {
      const page = await poolsClient.getFilteredPools(
        {
          perPage: 1,
          filter: EMPTY_CATALOG_FILTER,
          facets: true,
          ...(nearby ? { nearby: true } : {}),
        },
        signal,
      );
      return {
        tagFacets: page.tagFacets ?? [],
        voucherFacets: page.voucherFacets ?? [],
      };
    },
    enabled,
    staleTime: POOLS_STALE_TIME,
    gcTime: FILTERED_POOLS_GC_TIME,
    refetchOnReconnect: false,
    ...nearbyQueryPolicy(nearby),
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });
}

function ensureSelectedPoolVoucherFacets(
  facets: PoolVoucherFacet[],
  selected: readonly VoucherRef[],
): PoolVoucherFacet[] {
  const keys = new Set(facets.map(serializeVoucherRef));
  const missing = selected.filter((voucher) => !keys.has(serializeVoucherRef(voucher)));
  if (missing.length === 0) return facets;
  return [
    ...facets,
    ...missing.map((voucher) => ({
      ...voucher,
      name: formatVoucherAddress(voucher.address),
      symbol: "",
      count: 0,
      placeholder: true,
    })),
  ];
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
  voucherFacets: PoolVoucherFacet[];
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
  /** The facet vocabulary is only read inside the filter sheet — don't pay for it until it opens. */
  vocabularyEnabled: boolean,
): PoolCatalog {
  const filtered = useFilteredPools(filter.isFiltered ? filter.filter : null);
  const vocabulary = usePoolFacetVocabulary(vocabularyEnabled);

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
      vocabulary.data?.tagFacets;
    return ensureSelectedPoolFacets(source ?? [], selected);
  }, [filter.result, state, vocabulary.data]);

  const voucherSource = useMemo(
    () =>
      (state.status === "refining" || state.status === "ready" ? state.data.voucherFacets : null) ??
      vocabulary.data?.voucherFacets ??
      null,
    [state, vocabulary.data],
  );

  const voucherFacets = useMemo(() => {
    const selected = filter.result.ok ? filter.result.filter.vouchers : [];
    return ensureSelectedPoolVoucherFacets(voucherSource ?? [], selected);
  }, [filter.result, voucherSource]);

  return useMemo(() => {
    if (!filter.isFiltered) {
      return {
        pools: unfiltered.pools,
        status: unfiltered.error ? "error" : unfiltered.isPending ? "loading" : "ready",
        error: unfiltered.error,
        retry: unfiltered.retry,
        tagFacets: chipFacets,
        voucherFacets,
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
      voucherFacets,
      hasMore: false,
      loadMore: () => {},
      isLoadingMore: false,
    };
  }, [filter.isFiltered, unfiltered, state, chipFacets, voucherFacets, filtered]);
}
