import { queryOptions, useQuery } from "@tanstack/react-query";

import { getMarketVoucher } from "#/features/home/api/market-client";
import { MARKET_QUERY_FRESHNESS } from "./use-market-vouchers";

const marketVoucherDetailQueryKeys = {
  all: ["market-voucher-detail"] as const,
  byAddress: (address: string) =>
    // Lowercased for cache identity only. A link may be pasted in any casing,
    // and the map card and the voucher page must share one cache entry so
    // navigation lands on data that is already there.
    [...marketVoucherDetailQueryKeys.all, address.toLowerCase()] as const,
};

export function marketVoucherDetailQuery(address: string) {
  return queryOptions({
    queryKey: marketVoucherDetailQueryKeys.byAddress(address),
    queryFn: ({ signal }) => getMarketVoucher(address, signal),
    ...MARKET_QUERY_FRESHNESS,
  });
}

export function useMarketVoucherDetail(address: string | undefined) {
  return useQuery({
    ...marketVoucherDetailQuery(address ?? ""),
    enabled: !!address,
  });
}
