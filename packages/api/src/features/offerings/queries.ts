import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { OfferingsClient } from "./client";

export const offeringKeys = {
  all: ["clc", "offerings"] as const,
  byVoucher: (address: string, perPage: number) =>
    ["clc", "offerings", "voucher", address.toLowerCase(), perPage] as const,
  byPool: (address: string, perPage: number) =>
    ["clc", "offerings", "pool", address.toLowerCase(), perPage] as const,
} as const;

export function voucherOfferingsQueryOptions(
  offerings: OfferingsClient,
  address: string,
  perPage: number,
) {
  return queryOptions({
    queryKey: offeringKeys.byVoucher(address, perPage),
    queryFn: ({ signal }) => offerings.getVoucherOfferings(address, { perPage }, signal),
    enabled: address !== "",
    placeholderData: keepPreviousData,
  });
}
