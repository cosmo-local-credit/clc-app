import { useNearbyCatalog, nearbyQueryPolicy } from "#/components/nearby-catalog";
import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { DEFAULT_POST_TIMING, type PostTiming } from "@clc/core/features/reports/logic";
import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  reportFeedInfiniteQueryOptions,
  reportPoolFeedInfiniteQueryOptions,
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

export function useReportsInfinite(
  perPage = REPORTS_PAGE_SIZE,
  enabled = true,
  timing: PostTiming = DEFAULT_POST_TIMING,
) {
  const nearby = useNearbyCatalog();
  const options = reportFeedInfiniteQueryOptions(reportsClient, perPage, nearby, timing);
  return useInfiniteQuery({
    ...options,
    enabled,
    ...MARKET_QUERY_FRESHNESS,
    ...nearbyQueryPolicy(nearby),
  });
}

export function usePoolReportsInfinite(
  pool: VoucherRef | undefined,
  perPage = VOUCHER_REPORTS_PAGE_SIZE,
  enabled = true,
) {
  const normalizedPool = pool
    ? {
        chainId: pool.chainId,
        address: pool.address.toLowerCase() as VoucherRef["address"],
      }
    : undefined;

  return useInfiniteQuery({
    ...reportPoolFeedInfiniteQueryOptions(reportsClient, normalizedPool, perPage),
    enabled: enabled && !!normalizedPool,
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

export function useReportLocation(
  lat: number | null | undefined,
  lng: number | null | undefined,
  allow = true,
) {
  const enabled = allow && typeof lat === "number" && typeof lng === "number";

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
