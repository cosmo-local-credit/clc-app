import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { BackendApiError } from "#/features/auth/api/client";
import {
  type FilteredReportPage,
  type ReportCursor,
  type ReportSummary,
  type ReportTagFacet,
  getFilteredReports,
} from "#/features/home/api/reports-client";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const REPORTS_FILTER_PAGE_SIZE = 100;

const MAX_FILTERED_REPORT_PAGES = 30;

const FILTERED_REPORTS_GC_TIME = 5 * 60_000;
const REPORTS_STALE_TIME = 10 * 60_000;

const EMPTY_CATALOG_FILTER: CatalogFilter = { term: "", tags: [], tagMatch: "any" };

const filteredReportQueryKeys = {
  all: ["reports"] as const,
  filtered: (filter: CatalogFilter | null, perPage: number) =>
    [...filteredReportQueryKeys.all, "filtered", { filter, perPage }] as const,
  facetVocabulary: () => [...filteredReportQueryKeys.all, "facet-vocabulary"] as const,
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
};

type FilteredReportsState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "refining"; data: FilteredReportFeed }
  | { status: "ready"; data: FilteredReportFeed }
  | { status: "error"; error: Error };

function useFilteredReportsQuery(filter: CatalogFilter | null, perPage = REPORTS_FILTER_PAGE_SIZE) {
  return useQuery({
    queryKey: filteredReportQueryKeys.filtered(filter, perPage),
    queryFn: async ({ signal }): Promise<FilteredReportFeed> => {
      if (!filter) throw new Error("The filtered reports query ran without a filter.");

      const pages: FilteredReportPage[] = [];
      let cursor: ReportCursor | undefined;

      for (let index = 0; index < MAX_FILTERED_REPORT_PAGES; index++) {
        const page = await getFilteredReports(
          { perPage, cursor, filter, facets: index === 0 },
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

      return { reports: [...byId.values()], tagFacets: pages[0]?.tagFacets ?? null };
    },
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    staleTime: REPORTS_STALE_TIME,
    gcTime: FILTERED_REPORTS_GC_TIME,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof FilteredReportsTooLargeError) return false;
      if (error instanceof BackendApiError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

function useReportFacetVocabulary() {
  return useQuery({
    queryKey: filteredReportQueryKeys.facetVocabulary(),
    queryFn: async ({ signal }) => {
      const page = await getFilteredReports(
        { perPage: 1, filter: EMPTY_CATALOG_FILTER, facets: true },
        signal,
      );
      return page.tagFacets ?? [];
    },
    staleTime: REPORTS_STALE_TIME,
    gcTime: FILTERED_REPORTS_GC_TIME,
    refetchOnReconnect: false,
    retry: (failureCount, error) =>
      error instanceof BackendApiError && error.status >= 400 && error.status < 500
        ? false
        : failureCount < 1,
  });
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
): ReportFeed {
  const filtered = useFilteredReportsQuery(filter.isFiltered ? filter.filter : null);
  const vocabulary = useReportFacetVocabulary();

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
      vocabulary.data;
    return ensureSelectedReportFacets(source ?? [], selected);
  }, [filter.result, state, vocabulary.data]);

  return useMemo(() => {
    if (!filter.isFiltered) {
      return {
        reports: unfiltered.reports,
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
      reports: data?.reports ?? [],
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
