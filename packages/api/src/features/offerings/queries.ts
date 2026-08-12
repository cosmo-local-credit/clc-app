import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { OfferingPage, OfferingsClient } from "./client";

/**
 * Canonical query identity and base options for offerings.
 *
 * Offerings are reachable two ways — by voucher and by pool — and the two are
 * separate resources, not one filtered by owner, so they get separate keys.
 */
export const offeringKeys = {
  all: ["clc", "offerings"] as const,

  /**
   * Finite and infinite reads cache different shapes, so they never share a key.
   *
   * `perPage` is part of both, including the infinite ones: it decides request
   * size *and* the cursor termination rule, so two callers using different page
   * sizes would otherwise share one InfiniteData whose page boundaries are wrong
   * for at least one of them.
   */
  byVoucher: (address: string, perPage: number) =>
    ["clc", "offerings", "voucher", address.toLowerCase(), perPage] as const,
  byVoucherInfinite: (address: string, perPage: number) =>
    ["clc", "offerings", "voucher", "infinite", address.toLowerCase(), perPage] as const,

  byPool: (address: string, perPage: number) =>
    ["clc", "offerings", "pool", address.toLowerCase(), perPage] as const,
  byPoolInfinite: (address: string, perPage: number) =>
    ["clc", "offerings", "pool", "infinite", address.toLowerCase(), perPage] as const,
} as const;

/**
 * Termination rule for either offering cursor.
 *
 * Stop on a short page measured by rows the backend sent, on an empty-page zero
 * cursor, and on a cursor that failed to strictly decrease — the last of which
 * would otherwise page forever against a misbehaving backend.
 */
export function nextOfferingCursor(perPage: number) {
  return (lastPage: OfferingPage, allPages: OfferingPage[]): number | undefined => {
    if (lastPage.receivedCount < perPage || lastPage.last === 0) return undefined;
    const previous = allPages.at(-2);
    if (previous && lastPage.last >= previous.last) return undefined;
    return lastPage.last;
  };
}

export function voucherOfferingsQueryOptions(
  offerings: OfferingsClient,
  address: string | undefined,
  perPage: number,
) {
  return queryOptions({
    queryKey: offeringKeys.byVoucher(address ?? "none", perPage),
    queryFn: ({ signal }) =>
      offerings.getVoucherOfferings(requireAddress(address), { perPage }, signal),
    enabled: Boolean(address),
    placeholderData: keepPreviousData,
  });
}

export function voucherOfferingsInfiniteQueryOptions(
  offerings: OfferingsClient,
  address: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: offeringKeys.byVoucherInfinite(address ?? "none", perPage),
    queryFn: ({ pageParam, signal }) =>
      offerings.getVoucherOfferings(
        requireAddress(address),
        { perPage, cursor: pageParam, next: pageParam === undefined ? undefined : true },
        signal,
      ),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextOfferingCursor(perPage),
  });
}

export function poolOfferingsInfiniteQueryOptions(
  offerings: OfferingsClient,
  address: string | undefined,
  perPage: number,
) {
  return infiniteQueryOptions({
    queryKey: offeringKeys.byPoolInfinite(address ?? "none", perPage),
    queryFn: ({ pageParam, signal }) =>
      offerings.getPoolOfferings(
        requireAddress(address),
        { perPage, cursor: pageParam, next: pageParam === undefined ? undefined : true },
        signal,
      ),
    enabled: Boolean(address),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextOfferingCursor(perPage),
  });
}

function requireAddress(address: string | undefined): string {
  if (!address) throw new Error("Address is required.");
  return address;
}
