import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { MarketClient } from "./client";

export const voucherKeys = {
  all: ["clc", "vouchers"] as const,
  list: (perPage: number) => ["clc", "vouchers", "list", perPage] as const,
  detail: (address: string) => ["clc", "vouchers", "detail", address.toLowerCase()] as const,
} as const;

export function voucherListQueryOptions(market: MarketClient, perPage: number) {
  return queryOptions({
    queryKey: voucherKeys.list(perPage),
    queryFn: ({ signal }) => market.getMarketVouchers({ perPage }, signal),
    placeholderData: keepPreviousData,
  });
}

export function voucherQueryOptions(market: MarketClient, address: string) {
  return queryOptions({
    queryKey: voucherKeys.detail(address),
    queryFn: ({ signal }) => market.getMarketVoucher(address, signal),
    enabled: address !== "",
  });
}
