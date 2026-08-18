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
/** No text or tag narrowing: the author is the whole filter. */
const EMPTY_REPORT_FILTER: CatalogFilter = {
  term: "",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

export const reportKeys = {
  all: ["clc", "reports"] as const,

  /** Finite and infinite reads cache different shapes, so they never share a key. */
  list: (perPage: number) => ["clc", "reports", "list", perPage] as const,
  feed: (perPage: number) => ["clc", "reports", "feed", perPage] as const,

  detail: (id: string) => ["clc", "reports", "detail", id] as const,

  filtered: (filter: CatalogFilter | null, perPage: number) =>
    ["clc", "reports", "filtered", { filter, perPage }] as const,

  /** Reports authored by one account. */
  byAuthor: (author: string, perPage: number) =>
    ["clc", "reports", "author", author.toLowerCase(), perPage] as const,
  facetVocabulary: () => ["clc", "reports", "facet-vocabulary"] as const,
} as const;

export function reportFeedInfiniteQueryOptions(reports: ReportsClient, perPage: number) {
  return infiniteQueryOptions({
    queryKey: reportKeys.feed(perPage),
    queryFn: ({ pageParam, signal }) => reports.getReports({ perPage, cursor: pageParam }, signal),
    initialPageParam: undefined as ReportCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });
}

export function reportFilteredQueryOptions(
  reports: ReportsClient,
  filter: CatalogFilter,
  perPage: number,
) {
  return queryOptions({
    queryKey: reportKeys.filtered(filter, perPage),
    queryFn: ({ signal }) => reports.getFilteredReports({ filter, perPage }, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Reports authored by one account.
 *
 * Filtered at the backend rather than by scanning the feed: a global page filtered
 * in the browser answers with whichever reports happened to be on it, which for an
 * audit screen omits without saying so.
 */
export function reportsByAuthorQueryOptions(
  reports: ReportsClient,
  author: string | undefined,
  perPage: number,
) {
  return queryOptions({
    queryKey: reportKeys.byAuthor(author ?? "none", perPage),
    queryFn: ({ signal }) =>
      reports.getFilteredReports(
        { perPage, filter: EMPTY_REPORT_FILTER, author: author ?? "" },
        signal,
      ),
    enabled: Boolean(author),
    placeholderData: keepPreviousData,
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
