import { voucherQueryOptions } from "@clc/api/features/market/queries";
import { useQuery } from "@tanstack/react-query";

import { MARKET_QUERY_FRESHNESS } from "./use-market-vouchers";
import { clcApi } from "#/lib/api";

/**
 * Canonical detail options plus this app's freshness. Kept as a named factory
 * because route loaders prefetch through it as well as components.
 */
export function marketVoucherDetailQuery(address: string) {
  return {
    ...voucherQueryOptions(clcApi.market, address),
    ...MARKET_QUERY_FRESHNESS,
  };
}

export function useMarketVoucherDetail(address: string | undefined) {
  return useQuery({
    ...voucherQueryOptions(clcApi.market, address),
    ...MARKET_QUERY_FRESHNESS,
  });
}
