import {
  poolOfferingsInfiniteQueryOptions,
  voucherOfferingsInfiniteQueryOptions,
} from "@clc/api/features/offerings/queries";
import { useInfiniteQuery } from "@tanstack/react-query";

import { MARKET_QUERY_FRESHNESS } from "#/features/home/hooks/use-market-vouchers";
import { clcApi } from "#/lib/api";

/** The imported catalog's largest single-voucher offering count is 19. */
const VOUCHER_OFFERINGS_PAGE_SIZE = 20;

export function useVoucherOfferingsInfinite(
  voucherAddress: string | undefined,
  perPage = VOUCHER_OFFERINGS_PAGE_SIZE,
) {
  return useInfiniteQuery({
    ...voucherOfferingsInfiniteQueryOptions(clcApi.offerings, voucherAddress, perPage),
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
    ...poolOfferingsInfiniteQueryOptions(clcApi.offerings, poolAddress, perPage),
    ...MARKET_QUERY_FRESHNESS,
  });
}
