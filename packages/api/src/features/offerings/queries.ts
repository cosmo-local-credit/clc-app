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
   * The prefix every read of one voucher's offerings shares.
   *
   * This exists because a write has to find them all. The previous shapes put the
   * address at index 3 for a finite read and index 4 for an infinite one, so
   * there was no prefix that matched both — and a patcher that missed a shape
   * would fall through to invalidation, which the public endpoint's
   * `max-age=60` can answer with the pre-mutation body.
   */
  voucherRoot: (address: string) => ["clc", "offerings", "voucher", address.toLowerCase()] as const,

  /**
   * Finite and infinite reads cache different shapes, so they never share a key.
   *
   * `perPage` is part of both, including the infinite ones: it decides request
   * size *and* the cursor termination rule, so two callers using different page
   * sizes would otherwise share one InfiniteData whose page boundaries are wrong
   * for at least one of them.
   */
  byVoucher: (address: string, perPage: number) =>
    [...offeringKeys.voucherRoot(address), "page", perPage] as const,
  byVoucherInfinite: (address: string, perPage: number) =>
    [...offeringKeys.voucherRoot(address), "infinite", perPage] as const,

  /**
   * The owner's own view of the same rows, read with `cache: "no-store"`.
   *
   * A separate key rather than a flag, because it caches a different thing: the
   * guest read may legitimately be up to a minute stale while the managed one may
   * not be, and one cache entry cannot be both. The patcher updates both.
   */
  byVoucherManaged: (address: string, perPage: number) =>
    [...offeringKeys.voucherRoot(address), "managed", "page", perPage] as const,
  byVoucherManagedInfinite: (address: string, perPage: number) =>
    [...offeringKeys.voucherRoot(address), "managed", "infinite", perPage] as const,

  /** One offering, seeded from a write's own response. */
  detail: (address: string, id: string) =>
    [...offeringKeys.voucherRoot(address), "detail", id] as const,

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

export function managedVoucherOfferingsInfiniteQueryOptions(
  offerings: OfferingsClient,
  address: string | undefined,
  perPage: number,
  enabled = true,
) {
  return infiniteQueryOptions({
    queryKey: offeringKeys.byVoucherManagedInfinite(address ?? "none", perPage),
    queryFn: ({ pageParam, signal }) =>
      offerings.getVoucherOfferings(
        requireAddress(address),
        { perPage, cursor: pageParam, next: pageParam === undefined ? undefined : true },
        signal,
        { cache: "no-store" },
      ),
    enabled: Boolean(address) && enabled,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextOfferingCursor(perPage),
  });
}

/**
 * One page of the offerings published against a pool's allowed vouchers.
 *
 * The finite read exists for the console, which shows a pool's market presence
 * as one bounded panel rather than an endless scroll: the pool screen wants a
 * page it can summarise, not a feed.
 */
export function poolOfferingsQueryOptions(
  offerings: OfferingsClient,
  address: string | undefined,
  perPage: number,
) {
  return queryOptions({
    queryKey: offeringKeys.byPool(address ?? "none", perPage),
    queryFn: ({ signal }) =>
      offerings.getPoolOfferings(requireAddress(address), { perPage }, signal),
    enabled: Boolean(address),
    placeholderData: keepPreviousData,
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
