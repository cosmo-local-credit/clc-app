import {
  managedVoucherOfferingsInfiniteQueryOptions,
  poolOfferingsInfiniteQueryOptions,
  voucherOfferingsInfiniteQueryOptions,
} from "@clc/api/features/offerings/queries";
import { useInfiniteQuery } from "@tanstack/react-query";

import { MARKET_QUERY_FRESHNESS } from "#/features/home/hooks/use-market-vouchers";
import { offeringsClient } from "#/lib/api/offerings";

/** The imported catalog's largest single-voucher offering count is 19. */
const VOUCHER_OFFERINGS_PAGE_SIZE = 20;

export function useVoucherOfferingsInfinite(
  voucherAddress: string | undefined,
  perPage = VOUCHER_OFFERINGS_PAGE_SIZE,
) {
  return useInfiniteQuery({
    ...voucherOfferingsInfiniteQueryOptions(offeringsClient, voucherAddress, perPage),
    ...MARKET_QUERY_FRESHNESS,
  });
}

/**
 * The same rows, read by the voucher's own issuer.
 *
 * A separate query with `cache: "no-store"`, not a flag on the one above. The
 * public endpoint is cached `public, max-age=60, stale-while-revalidate=300`,
 * which is correct for browsing and wrong for the person editing the list: a
 * refetch after a write can be answered from the browser's HTTP cache with the
 * body from before it. `MARKET_QUERY_FRESHNESS` is deliberately not applied —
 * that staleness budget is for a market screen, and this one is authoritative.
 */
export function useManagedVoucherOfferingsInfinite(
  voucherAddress: string | undefined,
  perPage = VOUCHER_OFFERINGS_PAGE_SIZE,
) {
  return useInfiniteQuery(
    managedVoucherOfferingsInfiniteQueryOptions(offeringsClient, voucherAddress, perPage),
  );
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
    ...poolOfferingsInfiniteQueryOptions(offeringsClient, poolAddress, perPage),
    ...MARKET_QUERY_FRESHNESS,
  });
}
