import { useInfiniteQuery } from "@tanstack/react-query";

import {
  type OfferingPage,
  getPoolOfferings,
  getVoucherOfferings,
} from "#/features/home/api/offerings-client";
import { MARKET_QUERY_FRESHNESS } from "#/features/home/hooks/use-market-vouchers";

/** The imported catalog's largest single-voucher offering count is 19. */
const VOUCHER_OFFERINGS_PAGE_SIZE = 20;

const voucherOfferingQueryKeys = {
  all: ["voucher-offerings"] as const,
  byVoucher: (voucherAddress: string | undefined) =>
    [...voucherOfferingQueryKeys.all, voucherAddress?.toLowerCase() ?? "none"] as const,
  byPool: (poolAddress: string | undefined) =>
    [...voucherOfferingQueryKeys.all, "pool", poolAddress?.toLowerCase() ?? "none"] as const,
};

export function useVoucherOfferingsInfinite(
  voucherAddress: string | undefined,
  perPage = VOUCHER_OFFERINGS_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: voucherOfferingQueryKeys.byVoucher(voucherAddress),
    queryFn: ({ pageParam, signal }) =>
      getVoucherOfferings(
        requireAddress(voucherAddress),
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled: !!voucherAddress,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextCursor(perPage),
    ...MARKET_QUERY_FRESHNESS,
  });
}

/**
 * Every offering the pool's allowed vouchers publish, in one paginated query.
 *
 * Deliberately not a fan-out over `usePoolVouchers`: a pool may allow many
 * vouchers, and one request each would multiply into a request storm on a screen
 * that only ever renders 20 tiles at a time.
 */
export function usePoolOfferingsInfinite(
  poolAddress: string | undefined,
  perPage = VOUCHER_OFFERINGS_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: voucherOfferingQueryKeys.byPool(poolAddress),
    queryFn: ({ pageParam, signal }) =>
      getPoolOfferings(
        requireAddress(poolAddress),
        {
          perPage,
          cursor: pageParam,
          next: pageParam === undefined ? undefined : true,
        },
        signal,
      ),
    enabled: !!poolAddress,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextCursor(perPage),
    ...MARKET_QUERY_FRESHNESS,
  });
}

/**
 * Stop on a short page measured by rows the backend sent, on an empty-page zero
 * cursor, and on a cursor that failed to strictly decrease — the last of which
 * would otherwise page forever against a misbehaving backend.
 */
function nextCursor(perPage: number) {
  return (lastPage: OfferingPage, allPages: OfferingPage[]): number | undefined => {
    if (lastPage.receivedCount < perPage || lastPage.last === 0) return undefined;
    const previous = allPages.at(-2);
    if (previous && lastPage.last >= previous.last) return undefined;
    return lastPage.last;
  };
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Address is required.");
  return address;
}
