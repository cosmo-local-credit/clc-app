import { useCallback, useMemo } from "react";

import type { MarketTagFacet, MarketVoucher } from "@clc/api/features/market/client";
import {
  ensureSelectedFacets,
  toFilteredCatalogState,
  useFilteredMarketVouchers,
  useMarketFacetVocabulary,
} from "#/features/home/hooks/use-filtered-market-vouchers";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { useMarketMapVouchers } from "#/features/home/hooks/use-market-vouchers";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";

export type MarketCatalog = {
  vouchers: MarketVoucher[];
  isCatalogComplete: boolean;
  status: "loading" | "refining" | "ready" | "error";
  error: Error | null;
  retry: () => void;
  /** The vouchers are loading again after `retry`. */
  retrying: boolean;
  tagFacets: MarketTagFacet[];
  filterKey: string;
};

export function useMarketCatalogVouchers(
  filter: CatalogFilterControls,
  bounds: readonly MarketBoundingBox[] = [],
  enabled = true,
  /** The facet vocabulary is only read inside the filter sheet — don't pay for it until it opens. */
  vocabularyEnabled = false,
  pools?: readonly { chainId: number; address: string }[],
): MarketCatalog {
  const usesPoolFilter = pools !== undefined;
  const unfiltered = useMarketMapVouchers(
    bounds,
    undefined,
    enabled && !filter.isFiltered && !usesPoolFilter,
  );
  const filtered = useFilteredMarketVouchers(
    enabled && filter.result.ok && (filter.isFiltered || usesPoolFilter)
      ? (filter.filter ?? EMPTY_CATALOG_FILTER)
      : null,
    undefined,
    pools,
    bounds,
  );
  const filteredState = toFilteredCatalogState(filtered, filter.isDebouncing);
  const vocabulary = useMarketFacetVocabulary(vocabularyEnabled, bounds);

  const retryFiltered = useCallback(() => {
    void filtered.refetch();
  }, [filtered]);

  const chipFacets = useMemo(() => {
    const selected = filter.result.ok ? filter.result.filter.tags : [];
    const source =
      (filteredState.status === "refining" || filteredState.status === "ready"
        ? filteredState.data.tagFacets
        : null) ?? vocabulary.data;
    return ensureSelectedFacets(source ?? [], selected);
  }, [filter.result, filteredState, vocabulary.data]);

  return useMemo(() => {
    if (!enabled) {
      return {
        vouchers: [],
        isCatalogComplete: false,
        status: "loading",
        error: null,
        retry: unfiltered.retry,
        retrying: false,
        tagFacets: chipFacets,
        filterKey: "restoring-preference",
      };
    }

    if (!filter.isFiltered && !usesPoolFilter) {
      return {
        vouchers: unfiltered.vouchers,
        isCatalogComplete: unfiltered.isCatalogComplete,
        status: unfiltered.error ? "error" : unfiltered.isLoading ? "loading" : "ready",
        error: unfiltered.error,
        retry: unfiltered.retry,
        retrying: unfiltered.retrying,
        tagFacets: chipFacets,
        filterKey: "",
      };
    }

    if (filteredState.status === "disabled") {
      return {
        vouchers: [],
        isCatalogComplete: true,
        status: "ready",
        error: null,
        retry: retryFiltered,
        retrying: false,
        tagFacets: chipFacets,
        filterKey: `${filterIdentity(filter)}\u0000${poolIdentity(pools)}`,
      };
    }

    const data =
      filteredState.status === "refining" || filteredState.status === "ready"
        ? filteredState.data
        : null;

    return {
      vouchers: data?.vouchers ?? [],
      isCatalogComplete: true,
      status: filteredState.status,
      error: filteredState.status === "error" ? filteredState.error : null,
      retry: retryFiltered,
      retrying: filtered.isFetching,
      tagFacets: chipFacets,
      filterKey: `${filterIdentity(filter)}\u0000${poolIdentity(pools)}`,
    };
  }, [
    enabled,
    filter,
    unfiltered,
    filteredState,
    retryFiltered,
    chipFacets,
    pools,
    usesPoolFilter,
  ]);
}

function poolIdentity(pools: readonly { chainId: number; address: string }[] | undefined): string {
  return pools?.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`).join(",") ?? "all";
}

function filterIdentity(filter: CatalogFilterControls): string {
  if (!filter.result.ok) return `invalid:${filter.result.reason}`;
  const { term, tags, tagMatch } = filter.result.filter;
  // NUL separates the parts so no term or tag value can forge another part's boundary.
  return `${term}\u0000${tags.join(",")}\u0000${tagMatch}`;
}
