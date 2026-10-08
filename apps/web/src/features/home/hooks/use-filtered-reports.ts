import {
  filterNearbyCatalog,
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
import { reportKeys } from "@clc/api/features/reports/queries";
import {
  type FilteredReportPage,
  type ReportCursor,
  type ReportSummary,
  type ReportTagFacet,
  type ReportVoucherFacet,
} from "@clc/api/features/reports/client";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { reportsClient } from "#/lib/api/reports";

const REPORTS_FILTER_PAGE_SIZE = 100;

const MAX_FILTERED_REPORT_PAGES = 30;

const FILTERED_REPORTS_GC_TIME = 5 * 60_000;
const REPORTS_STALE_TIME = 10 * 60_000;

const EMPTY_CATALOG_FILTER: CatalogFilter = {
  term: "",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

// Identity is canonical in @clc/api; the multi-page assembly and page budget
// below stay app-specific.
const filteredReportQueryKeys = {
  filtered: reportKeys.filtered,
  facetVocabulary: reportKeys.facetVocabulary,
};

export class FilteredReportsTooLargeError extends Error {
  constructor(readonly pagesWalked: number) {
    super(`The filtered report feed exceeded ${pagesWalked} pages.`);
    this.name = "FilteredReportsTooLargeError";
  }
}

type FilteredReportFeed = {
  reports: ReportSummary[];
  tagFacets: ReportTagFacet[] | null;
  voucherFacets: ReportVoucherFacet[] | null;
};

type FilteredReportsState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "refining"; data: FilteredReportFeed }
  | { status: "ready"; data: FilteredReportFeed }
  | { status: "error"; error: Error };

function useFilteredReportsQuery(filter: CatalogFilter | null, perPage = REPORTS_FILTER_PAGE_SIZE) {
  const nearby = useNearbyCatalog();
  const visibilityFilter = useNearbyCatalogFilter();
  return useQuery({
    queryKey: nearbyQueryKey(filteredReportQueryKeys.filtered(filter, perPage), nearby),
    queryFn: async ({ signal }): Promise<FilteredReportFeed> => {
      if (!filter) throw new Error("The filtered reports query ran without a filter.");

      const pages: FilteredReportPage[] = [];
      let cursor: ReportCursor | undefined;

      for (let index = 0; index < MAX_FILTERED_REPORT_PAGES; index++) {
        const page = await reportsClient.getFilteredReports(
          { perPage, cursor, filter, facets: index === 0, ...(nearby ? { nearby: true } : {}) },
          signal,
        );
        pages.push(page);

        const next = page.next ?? undefined;
        if (
          next === undefined ||
          (cursor !== undefined && next.updatedAt === cursor.updatedAt && next.id === cursor.id)
        ) {
          cursor = undefined;
          break;
        }
        cursor = next;
      }

      if (cursor !== undefined) throw new FilteredReportsTooLargeError(pages.length);

      const byId = new Map<string, ReportSummary>();
      for (const page of pages) {
        for (const report of page.reports) byId.set(report.id, report);
      }

      return {
        reports: filterNearbyCatalog([...byId.values()], visibilityFilter),
        tagFacets: pages[0]?.tagFacets ?? null,
        voucherFacets: pages[0]?.voucherFacets ?? null,
      };
    },
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    staleTime: REPORTS_STALE_TIME,
    gcTime: FILTERED_REPORTS_GC_TIME,
    refetchOnReconnect: false,
    ...nearbyQueryPolicy(nearby),
    // Only a transport failure or server fault is worth replaying; a rejected
    // filter, an exhausted page budget, or a bug in our own query function
    // will fail identically. See isRetryableBackendError.
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });
}

function useReportFacetVocabulary(enabled: boolean) {
  const nearby = useNearbyCatalog();
  return useQuery({
    queryKey: nearbyQueryKey(filteredReportQueryKeys.facetVocabulary(), nearby),
    queryFn: async ({ signal }) => {
      const page = await reportsClient.getFilteredReports(
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
    staleTime: REPORTS_STALE_TIME,
    gcTime: FILTERED_REPORTS_GC_TIME,
    refetchOnReconnect: false,
    ...nearbyQueryPolicy(nearby),
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });
}

function ensureSelectedReportVoucherFacets(
  facets: ReportVoucherFacet[],
  selected: readonly VoucherRef[],
): ReportVoucherFacet[] {
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

function ensureSelectedReportFacets(
  facets: ReportTagFacet[],
  selected: readonly string[],
): ReportTagFacet[] {
  const missing = selected.filter((tag) => !facets.some((facet) => facet.tag === tag));
  if (missing.length === 0) return facets;
  return [...facets, ...missing.map((tag) => ({ tag, count: 0 }))].sort((left, right) =>
    left.tag.localeCompare(right.tag),
  );
}

export type ReportFeed = {
  reports: ReportSummary[];
  status: "loading" | "refining" | "ready" | "error";
  error: Error | null;
  retry: () => void;
  tagFacets: ReportTagFacet[];
  voucherFacets: ReportVoucherFacet[];
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
};

export function useReportFeed(
  filter: CatalogFilterControls,
  unfiltered: {
    reports: ReportSummary[];
    isPending: boolean;
    error: Error | null;
    retry: () => void;
    hasNextPage: boolean;
    fetchNextPage: () => void;
    isFetchingNextPage: boolean;
  },
  /** The facet vocabulary is only read inside the filter sheet — don't pay for it until it opens. */
  vocabularyEnabled: boolean,
): ReportFeed {
  const filtered = useFilteredReportsQuery(filter.isFiltered ? filter.filter : null);
  const vocabulary = useReportFacetVocabulary(vocabularyEnabled);

  const state: FilteredReportsState = useMemo(() => {
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
    return ensureSelectedReportFacets(source ?? [], selected);
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
    return ensureSelectedReportVoucherFacets(voucherSource ?? [], selected);
  }, [filter.result, voucherSource]);

  return useMemo(() => {
    if (!filter.isFiltered) {
      return {
        reports: unfiltered.reports,
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
      reports: data?.reports ?? [],
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
