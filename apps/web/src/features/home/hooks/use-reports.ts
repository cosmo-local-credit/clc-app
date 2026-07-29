import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  type ReportCursor,
  type ReportPage,
  getReport,
  getReports,
} from "#/features/home/api/reports-client";
import { MARKET_QUERY_FRESHNESS } from "#/features/home/hooks/use-market-vouchers";
import { reverseLocation } from "#/features/onboarding/api/geo-client";

const REPORTS_PAGE_SIZE = 20;

const reportQueryKeys = {
  all: ["reports"] as const,
  feed: (perPage: number) => [...reportQueryKeys.all, "feed", { perPage }] as const,
  byId: (id: string | undefined) => [...reportQueryKeys.all, "detail", id ?? "none"] as const,
  location: (lat: number | null | undefined, lng: number | null | undefined) =>
    [...reportQueryKeys.all, "location", { lat: lat ?? "none", lng: lng ?? "none" }] as const,
};

/**
 * The Posts feed, newest update first.
 *
 * Freshness is the market policy (see `docs/TANSTACK_QUERY.md`): reports are the
 * same bulk-imported static catalog, and the feed unmounts on every home-tab
 * change, so the global one-minute stale time would re-walk every cached page.
 */
export function useReportsInfinite(perPage = REPORTS_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: reportQueryKeys.feed(perPage),
    queryFn: ({ pageParam, signal }) => getReports({ perPage, cursor: pageParam }, signal),
    initialPageParam: undefined as ReportCursor | undefined,
    // The backend says when the feed ends by omitting `next`, so there is no
    // short-page heuristic and no cursor to sanity-check for progress.
    getNextPageParam: (lastPage: ReportPage) => lastPage.next ?? undefined,
    ...MARKET_QUERY_FRESHNESS,
  });
}

export function reportQuery(id: string) {
  return queryOptions({
    queryKey: reportQueryKeys.byId(id),
    queryFn: ({ signal }) => getReport(id, signal),
    ...MARKET_QUERY_FRESHNESS,
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    ...reportQuery(id ?? ""),
    enabled: !!id,
  });
}

/** Resolve a report pin once per coordinate pair while it remains cached. */
export function useReportLocation(lat: number | null | undefined, lng: number | null | undefined) {
  const enabled = typeof lat === "number" && typeof lng === "number";

  return useQuery({
    queryKey: reportQueryKeys.location(lat, lng),
    queryFn: ({ signal }) => {
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      return reverseLocation(lat, lng, signal);
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
