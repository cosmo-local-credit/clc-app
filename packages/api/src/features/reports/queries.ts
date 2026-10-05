import {
  type CatalogFilter,
  type VoucherRef,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ManagedReportsParams, ReportCursor, ReportsClient } from "./client";

/**
 * Canonical query identity and base options for reports.
 *
 * Note that reports page by an opaque `{ updatedAt, id }` cursor rather than a
 * numeric one, so the infinite feed's page param is an object and its
 * termination is simply "the backend stopped offering a next cursor".
 *
 * Keys are split into four families — public lists, public detail, one author's
 * own, and the operator console's — because a write does not affect them
 * equally, and because `reportKeys.all` also covers the app-private
 * reverse-geocode entries in `apps/web`. Invalidating that prefix would refetch
 * third-party place lookups every time a post was saved, so nothing does.
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

  /**
   * Infinite feed of reports linked to one voucher.
   *
   * Distinct from `filtered`: that key caches a fully assembled catalog page used
   * by the posts search, not a cursor-walked infinite query.
   */
  voucherFeed: (voucher: VoucherRef | undefined, perPage: number) =>
    [
      "clc",
      "reports",
      "voucher",
      voucher ? serializeVoucherRef(voucher) : "none",
      perPage,
    ] as const,
  facetVocabulary: () => ["clc", "reports", "facet-vocabulary"] as const,

  /**
   * One author's own posts, in every status.
   *
   * The address is part of the key so a session switch cannot be served the
   * previous account's rows: these are the caller's private drafts, not catalog
   * data, and "mine" means whoever the cookie says.
   */
  mineRoot: () => ["clc", "reports", "mine"] as const,
  mineFor: (address: string) => [...reportKeys.mineRoot(), address.toLowerCase()] as const,
  mine: (address: string, params: ManagedReportsParams) =>
    [...reportKeys.mineFor(address), "list", params] as const,
  myDetail: (address: string, id: string) =>
    [...reportKeys.mineFor(address), "detail", id] as const,

  /** The operator console's global reads. */
  adminRoot: () => ["clc", "reports", "admin"] as const,
  adminList: (params: ManagedReportsParams) => [...reportKeys.adminRoot(), "list", params] as const,
  adminDetail: (id: string) => [...reportKeys.adminRoot(), "detail", id] as const,
} as const;

export function reportFeedInfiniteQueryOptions(
  reports: ReportsClient,
  perPage: number,
  nearby?: string,
) {
  return infiniteQueryOptions({
    queryKey: nearby ? ([...reportKeys.feed(perPage), nearby] as const) : reportKeys.feed(perPage),
    queryFn: ({ pageParam, signal }) =>
      reports.getReports(
        { perPage, cursor: pageParam, ...(nearby ? { nearby: true } : {}) },
        signal,
      ),
    initialPageParam: undefined as ReportCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });
}

/** Cursor-walked reports for one voucher, as the voucher detail posts tab reads them. */
export function reportVoucherFeedInfiniteQueryOptions(
  reports: ReportsClient,
  voucher: VoucherRef | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: reportKeys.voucherFeed(voucher, perPage),
    queryFn: ({ pageParam, signal }) => {
      if (!voucher) throw new Error("Voucher is required.");
      return reports.getFilteredReports(
        {
          perPage,
          cursor: pageParam,
          filter: { ...EMPTY_REPORT_FILTER, vouchers: [voucher] },
        },
        signal,
      );
    },
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
 * One account's posts are read through `adminReportsQueryOptions` with an
 * `author`, not through a public author feed.
 *
 * There was one: an approved-only, backend-filtered list for the console's
 * account panel. That panel is an audit view and has to show a submitted post,
 * which the catalog cannot, so the query and its `byAuthor` key went with it
 * rather than sitting unused.
 */

export function reportQueryOptions(reports: ReportsClient, id: string | undefined) {
  return queryOptions({
    queryKey: reportKeys.detail(id ?? "none"),
    queryFn: ({ signal }) => reports.getReport(requireId(id), signal),
    enabled: Boolean(id),
  });
}

/**
 * The signed-in author's own posts.
 *
 * `address` is the session's wallet and gates the query as well as keying it: a
 * page rendered before the session resolves must not fetch, because the backend
 * would answer for whoever the cookie names rather than for nobody.
 */
export function myReportsQueryOptions(
  reports: ReportsClient,
  address: string | undefined,
  params: ManagedReportsParams,
) {
  return queryOptions({
    queryKey: reportKeys.mine(address ?? "none", params),
    queryFn: ({ signal }) => reports.getMyReports(params, signal),
    enabled: Boolean(address),
    placeholderData: keepPreviousData,
  });
}

export function myReportQueryOptions(
  reports: ReportsClient,
  address: string | undefined,
  id: string | undefined,
) {
  return queryOptions({
    queryKey: reportKeys.myDetail(address ?? "none", id ?? "none"),
    queryFn: ({ signal }) => reports.getMyReport(requireId(id), signal),
    enabled: Boolean(address) && Boolean(id),
  });
}

export function adminReportsQueryOptions(reports: ReportsClient, params: ManagedReportsParams) {
  return queryOptions({
    queryKey: reportKeys.adminList(params),
    queryFn: ({ signal }) => reports.getAdminReports(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function adminReportQueryOptions(reports: ReportsClient, id: string | undefined) {
  return queryOptions({
    queryKey: reportKeys.adminDetail(id ?? "none"),
    queryFn: ({ signal }) => reports.getAdminReport(requireId(id), signal),
    enabled: Boolean(id),
  });
}

function requireId(id: string | undefined): string {
  if (!id) throw new Error("Report id is required.");
  return id;
}
