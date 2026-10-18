import { infiniteQueryOptions } from "@tanstack/react-query";
import type { OwnedVoucherPage, OwnedVouchersClient } from "./owned-client";

export const ownedVoucherKeys = {
  all: ["clc", "owned-vouchers"] as const,
  list: (address: string, perPage: number) =>
    [...ownedVoucherKeys.all, address.toLowerCase(), perPage] as const,
};

export function ownedVouchersInfiniteQueryOptions(
  client: OwnedVouchersClient,
  address: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: ownedVoucherKeys.list(address ?? "none", perPage),
    queryFn: ({ pageParam, signal }) =>
      client.list(
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page: OwnedVoucherPage) =>
      page.receivedCount < perPage || page.last === undefined ? undefined : page.last,
  });
}
