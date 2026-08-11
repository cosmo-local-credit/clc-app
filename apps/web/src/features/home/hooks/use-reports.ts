import { type VoucherRef, serializeVoucherRef } from "@clc/core/features/catalog/logic";
import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  type FilteredReportPage,
  type ReportCursor,
  type ReportPage,
} from "@clc/api/features/reports/client";
import { MARKET_QUERY_FRESHNESS } from "#/features/home/hooks/use-market-vouchers";
import { reverseLocation } from "#/lib/geo-client";
import { clcApi } from "#/lib/api";

const REPORTS_PAGE_SIZE = 20;

const VOUCHER_REPORTS_PAGE_SIZE = 20;

const reportQueryKeys = {
  all: ["reports"] as const,
  feed: (perPage: number) => [...reportQueryKeys.all, "feed", { perPage }] as const,
  byVoucher: (voucher: VoucherRef | undefined, perPage: number) =>
    [
      ...reportQueryKeys.all,
      "voucher",
      voucher ? serializeVoucherRef(voucher) : "none",
      { perPage },
    ] as const,
  byId: (id: string | undefined) => [...reportQueryKeys.all, "detail", id ?? "none"] as const,
  location: (lat: number | null | undefined, lng: number | null | undefined) =>
    [...reportQueryKeys.all, "location", { lat: lat ?? "none", lng: lng ?? "none" }] as const,
};

export function useReportsInfinite(perPage = REPORTS_PAGE_SIZE, enabled = true) {
  return useInfiniteQuery({
    queryKey: reportQueryKeys.feed(perPage),
    queryFn: ({ pageParam, signal }) =>
      clcApi.reports.getReports({ perPage, cursor: pageParam }, signal),
    enabled,
    initialPageParam: undefined as ReportCursor | undefined,
    getNextPageParam: (lastPage: ReportPage) => lastPage.next ?? undefined,
    ...MARKET_QUERY_FRESHNESS,
  });
}

export function useVoucherReportsInfinite(
  voucher: VoucherRef | undefined,
  perPage = VOUCHER_REPORTS_PAGE_SIZE,
  enabled = true,
) {
  const normalizedVoucher = voucher
    ? {
        chainId: voucher.chainId,
        address: voucher.address.toLowerCase() as VoucherRef["address"],
      }
    : undefined;

  return useInfiniteQuery({
    queryKey: reportQueryKeys.byVoucher(normalizedVoucher, perPage),
    queryFn: ({ pageParam, signal }) => {
      if (!normalizedVoucher) throw new Error("Voucher is required.");
      return clcApi.reports.getFilteredReports(
        {
          perPage,
          cursor: pageParam,
          filter: {
            term: "",
            tags: [],
            tagMatch: "any",
            vouchers: [normalizedVoucher],
            voucherMatch: "any",
          },
        },
        signal,
      );
    },
    enabled: enabled && !!normalizedVoucher,
    initialPageParam: undefined as ReportCursor | undefined,
    getNextPageParam: (lastPage: FilteredReportPage) => lastPage.next ?? undefined,
    ...MARKET_QUERY_FRESHNESS,
  });
}

function reportQuery(id: string) {
  return queryOptions({
    queryKey: reportQueryKeys.byId(id),
    queryFn: ({ signal }) => clcApi.reports.getReport(id, signal),
    ...MARKET_QUERY_FRESHNESS,
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    ...reportQuery(id ?? ""),
    enabled: !!id,
  });
}

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
