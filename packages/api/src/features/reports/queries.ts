import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ReportCursor, ReportsClient } from "./client";

/**
 * Canonical query identity and base options for reports.
 *
 * Every key hangs off `all` so one invalidation reaches the list, the infinite
 * feed, details, filtered results and facets.
 *
 * Note that reports page by an opaque `{ updatedAt, id }` cursor rather than a
 * numeric one, so the infinite feed's page param is an object and its
 * termination is simply "the backend stopped offering a next cursor".
 */
export const reportKeys = {
  all: ["clc", "reports"] as const,

  /** Finite and infinite reads cache different shapes, so they never share a key. */
  list: (perPage: number) => ["clc", "reports", "list", perPage] as const,
  feed: (perPage: number) => ["clc", "reports", "feed", perPage] as const,

  detail: (id: string) => ["clc", "reports", "detail", id] as const,

  filtered: (filter: CatalogFilter | null, perPage: number) =>
    ["clc", "reports", "filtered", { filter, perPage }] as const,
  facetVocabulary: () => ["clc", "reports", "facet-vocabulary"] as const,
} as const;

export function reportListQueryOptions(reports: ReportsClient, perPage: number) {
  return queryOptions({
    queryKey: reportKeys.list(perPage),
    queryFn: ({ signal }) => reports.getReports({ perPage }, signal),
    placeholderData: keepPreviousData,
  });
}

export function reportFeedInfiniteQueryOptions(reports: ReportsClient, perPage: number) {
  return infiniteQueryOptions({
    queryKey: reportKeys.feed(perPage),
    queryFn: ({ pageParam, signal }) => reports.getReports({ perPage, cursor: pageParam }, signal),
    initialPageParam: undefined as ReportCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });
}

export function reportQueryOptions(reports: ReportsClient, id: string | undefined) {
  return queryOptions({
    queryKey: reportKeys.detail(id ?? "none"),
    queryFn: ({ signal }) => reports.getReport(requireId(id), signal),
    enabled: Boolean(id),
  });
}

function requireId(id: string | undefined): string {
  if (!id) throw new Error("Report id is required.");
  return id;
}
