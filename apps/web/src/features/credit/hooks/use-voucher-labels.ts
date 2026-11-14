import { voucherQueryOptions } from "@clc/api/features/market/queries";
import { useQueries } from "@tanstack/react-query";

import { marketClient } from "#/lib/api/market";

export type VoucherLabel = { symbol: string; decimals: number | null };

const LABEL_STALE_MS = 5 * 60_000;

/**
 * Symbols and decimals for the vouchers a route or receipt names. The router
 * answers in addresses; one cached catalog read per voucher labels them.
 */
export function useVoucherLabels(addresses: readonly string[]) {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
  return useQueries({
    queries: unique.map((address) => ({
      ...voucherQueryOptions(marketClient, address),
      staleTime: LABEL_STALE_MS,
    })),
    combine: (results) => {
      const labels = new Map<string, VoucherLabel>();
      results.forEach((result, index) => {
        if (result.data) {
          labels.set(unique[index]!, {
            symbol: result.data.symbol,
            decimals: result.data.decimals,
          });
        }
      });
      return labels;
    },
  });
}
