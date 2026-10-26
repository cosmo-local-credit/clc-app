import { voucherInfoQueryOptions, voucherQueryOptions } from "@clc/api/features/market/queries";
import { useQuery } from "@tanstack/react-query";

import { MARKET_QUERY_FRESHNESS } from "./use-market-vouchers";
import { marketClient } from "#/lib/api/market";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

/**
 * Canonical detail options plus this app's freshness. Kept as a named factory
 * because route loaders prefetch through it as well as components.
 */
export function marketVoucherDetailQuery(address: string) {
  return {
    ...voucherQueryOptions(marketClient, address),
    ...MARKET_QUERY_FRESHNESS,
  };
}

export function useMarketVoucherDetail(address: string | undefined) {
  const auth = useAuthStatus();
  const publicQuery = useQuery({
    ...voucherQueryOptions(marketClient, address),
    ...MARKET_QUERY_FRESHNESS,
  });
  const viewer = auth.isAuthenticated ? auth.session?.address : undefined;
  const infoQuery = useQuery({
    ...voucherInfoQueryOptions(marketClient, address, viewer),
    retry: false,
  });

  return {
    ...publicQuery,
    data: infoQuery.data ?? publicQuery.data,
    privateInfo: viewer
      ? {
          isPending: infoQuery.isPending,
          isError: infoQuery.isError,
          isFetching: infoQuery.isFetching,
          refetch: infoQuery.refetch,
        }
      : undefined,
  };
}

/**
 * A receipt must verify the voucher's current owner before offering an order.
 * It shares the canonical detail cache key, but bypasses both the browser's
 * public response cache and the market screen's ten-minute freshness window.
 */
export function useCurrentMarketVoucherDetail(address: string | undefined) {
  return useQuery({
    ...voucherQueryOptions(marketClient, address, { cache: "no-store" }),
    gcTime: MARKET_QUERY_FRESHNESS.gcTime,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
}
