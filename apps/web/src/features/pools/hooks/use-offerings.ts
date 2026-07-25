import { useInfiniteQuery } from "@tanstack/react-query";

import { getOfferings, getVoucherOfferings } from "#/features/pools/api/pools-client";

export const DEFAULT_OFFERINGS_PAGE_SIZE = 20;

export const offeringQueryKeys = {
  all: ["offerings"] as const,
  list: (perPage: number) => [...offeringQueryKeys.all, "list", { perPage }] as const,
  byVoucher: (voucherAddress: string | undefined, perPage: number) =>
    [
      ...offeringQueryKeys.all,
      "voucher",
      voucherAddress?.toLowerCase() ?? "none",
      { perPage },
    ] as const,
};

export function useOfferingsInfinite(perPage = DEFAULT_OFFERINGS_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: offeringQueryKeys.list(perPage),
    queryFn: ({ pageParam }) =>
      getOfferings({
        perPage,
        cursor: pageParam,
        next: pageParam === undefined ? undefined : true,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.offerings.length < perPage || lastPage.last === undefined
        ? undefined
        : lastPage.last,
  });
}

export function useVoucherOfferingsInfinite(
  voucherAddress: string | undefined,
  perPage = DEFAULT_OFFERINGS_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: offeringQueryKeys.byVoucher(voucherAddress, perPage),
    queryFn: ({ pageParam }) =>
      getVoucherOfferings(requireVoucherAddress(voucherAddress), {
        perPage,
        cursor: pageParam,
        next: pageParam === undefined ? undefined : true,
      }),
    enabled: !!voucherAddress,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.offerings.length < perPage || lastPage.last === undefined
        ? undefined
        : lastPage.last,
  });
}

function requireVoucherAddress(voucherAddress: string | undefined): string {
  if (!voucherAddress) throw new Error("Voucher address is required.");
  return voucherAddress;
}
