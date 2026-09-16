import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  reportFeedInfiniteQueryOptions,
  reportKeys,
  reportVoucherFeedInfiniteQueryOptions,
} from "@clc/api/features/reports/queries";
import { MARKET_QUERY_FRESHNESS } from "#/features/home/hooks/use-market-vouchers";
import { reverseLocation } from "#/lib/geo-client";
import { reportsClient } from "#/lib/api/reports";

const REPORTS_PAGE_SIZE = 20;

const VOUCHER_REPORTS_PAGE_SIZE = 20;

const reportQueryKeys = {
  all: reportKeys.all,
  feed: reportKeys.feed,
  byId: (id: string | undefined) => reportKeys.detail(id ?? "none"),
  // Reverse geocoding is a third-party lookup, not a clc-core resource, so its
  // identity stays here. Kept under the shared prefix so a report invalidation
  // clears the place name alongside the report it belongs to.
  location: (lat: number | null | undefined, lng: number | null | undefined) =>
    [...reportKeys.all, "location", { lat: lat ?? "none", lng: lng ?? "none" }] as const,
};

export function useReportsInfinite(perPage = REPORTS_PAGE_SIZE, enabled = true) {
  return useInfiniteQuery({
    ...reportFeedInfiniteQueryOptions(reportsClient, perPage),
    enabled,
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
    ...reportVoucherFeedInfiniteQueryOptions(reportsClient, normalizedVoucher, perPage),
    enabled: enabled && !!normalizedVoucher,
    ...MARKET_QUERY_FRESHNESS,
  });
}

function reportQuery(id: string) {
  return queryOptions({
    queryKey: reportQueryKeys.byId(id),
    queryFn: ({ signal }) => reportsClient.getReport(id, signal),
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
