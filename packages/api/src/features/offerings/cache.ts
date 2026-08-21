import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { Offering, OfferingPage } from "./client";
import { offeringKeys } from "./queries";

/**
 * Writing an offering into every cached shape that holds it.
 *
 * This is patching rather than invalidating on purpose, and the reason is the
 * endpoint's own headers. `GET /vouchers/:address/offerings` answers
 * `public, max-age=60, stale-while-revalidate=300`, so an invalidation-triggered
 * refetch can be served the pre-mutation body straight out of the browser's HTTP
 * cache — the owner deletes a listing, the screen refetches, and the listing
 * comes back. The mutation response is the only thing that is definitely current,
 * so it is what the cache is updated from.
 *
 * That makes exhaustiveness a correctness property rather than an optimisation: a
 * shape the patcher does not know about stays stale with nothing to catch it.
 * Every key under `offeringKeys.voucherRoot` is therefore matched structurally
 * here, and `offeringListKeyShapes` is asserted against the key factories in the
 * tests so adding a shape without teaching the patcher fails.
 */

/** How far into a voucher-root key the shape discriminator starts. */
const VOUCHER_ROOT_LENGTH = 4;

/**
 * The shapes `voucherRoot` can be followed by, and whether each holds pages.
 *
 * Order matters only for readability; matching is exact.
 */
export const offeringListKeyShapes = [
  { segments: ["page"], infinite: false },
  { segments: ["infinite"], infinite: true },
  { segments: ["managed", "page"], infinite: false },
  { segments: ["managed", "infinite"], infinite: true },
] as const;

export type OfferingListKeyMatch = {
  infinite: boolean;
};

/**
 * Whether a query key is one of this voucher's offering *list* reads.
 *
 * Deliberately not a prefix test. The detail key shares the same root, and
 * patching a single `Offering` as though it were an `OfferingPage` would corrupt
 * it silently. The discriminator segments are what separate them.
 */
export function matchVoucherOfferingListKey(
  queryKey: readonly unknown[],
  voucherAddress: string,
): OfferingListKeyMatch | null {
  const root = offeringKeys.voucherRoot(voucherAddress);
  if (queryKey.length < VOUCHER_ROOT_LENGTH + 2) return null;
  for (let i = 0; i < VOUCHER_ROOT_LENGTH; i += 1) {
    if (queryKey[i] !== root[i]) return null;
  }

  const tail = queryKey.slice(VOUCHER_ROOT_LENGTH, -1);
  const shape = offeringListKeyShapes.find(
    (candidate) =>
      candidate.segments.length === tail.length &&
      candidate.segments.every((segment, index) => segment === tail[index]),
  );
  // The last segment is perPage. A key whose page size is not a number is not one
  // of ours, whatever its prefix looks like.
  if (!shape || typeof queryKey.at(-1) !== "number") return null;
  return { infinite: shape.infinite };
}

/**
 * Replaces a row where it already is, or inserts it at the head.
 *
 * `insertIfMissing` has to be decided across the whole cache entry rather than
 * per page. An infinite read holds several pages and a row lives in exactly one
 * of them, so a per-page "insert when absent" rule inserts a copy into page one
 * every time the real row is on page two.
 *
 * Newest first, matching every offering statement's `ORDER BY o.id DESC`, so a
 * created row lands at the top rather than wherever the array happened to end.
 */
function upsertPage(
  page: OfferingPage,
  offering: Offering,
  insertIfMissing: boolean,
): OfferingPage {
  const index = page.offerings.findIndex((row) => row.id === offering.id);
  if (index !== -1) {
    const offerings = page.offerings.slice();
    offerings[index] = offering;
    return { ...page, offerings };
  }
  if (!insertIfMissing) return page;
  // receivedCount is what the cursor's termination rule reads, and it counts rows
  // the *backend* sent. A locally inserted row did not come from the backend, so
  // incrementing it would tell the paginator a short page was full and stop it
  // fetching the rest.
  return { ...page, offerings: [offering, ...page.offerings] };
}

function removeRow(page: OfferingPage, id: string): OfferingPage {
  const offerings = page.offerings.filter((row) => row.id !== id);
  return offerings.length === page.offerings.length ? page : { ...page, offerings };
}

/**
 * Puts a created or updated offering into every cached read of its voucher.
 *
 * Returns the number of query entries it touched, which the caller uses only for
 * diagnostics — the patch is authoritative whether or not anything was cached.
 */
export function patchVoucherOfferingCaches(
  queryClient: QueryClient,
  voucherAddress: string,
  offering: Offering,
): number {
  queryClient.setQueryData(offeringKeys.detail(voucherAddress, offering.id), offering);

  let touched = 0;
  for (const query of queryClient.getQueryCache().findAll()) {
    const match = matchVoucherOfferingListKey(query.queryKey, voucherAddress);
    if (!match) continue;

    if (match.infinite) {
      queryClient.setQueryData<InfiniteData<OfferingPage, number | undefined>>(
        query.queryKey,
        (data) => {
          if (!data) return data;
          // Where the row already is decides whether this is an update or an
          // insert, for the entry as a whole. Insert goes to the first page only:
          // appending to a later one would put it on the wrong side of a cursor.
          const existing = data.pages.some((page) =>
            page.offerings.some((entry) => entry.id === offering.id),
          );
          return {
            ...data,
            pages: data.pages.map((page, index) =>
              upsertPage(page, offering, !existing && index === 0),
            ),
          };
        },
      );
    } else {
      queryClient.setQueryData<OfferingPage>(
        query.queryKey,
        (page) => page && upsertPage(page, offering, true),
      );
    }
    touched += 1;
  }
  return touched;
}

/**
 * Takes an unlisted offering out of every cached read of its voucher.
 *
 * The detail entry is removed rather than set to null: the row is gone from every
 * public read, so a cached `null` would be a value a component has to handle
 * where "not fetched" already means the same thing.
 */
export function removeVoucherOfferingFromCaches(
  queryClient: QueryClient,
  voucherAddress: string,
  offeringID: string,
): number {
  queryClient.removeQueries({
    queryKey: offeringKeys.detail(voucherAddress, offeringID),
    exact: true,
  });

  let touched = 0;
  for (const query of queryClient.getQueryCache().findAll()) {
    const match = matchVoucherOfferingListKey(query.queryKey, voucherAddress);
    if (!match) continue;

    if (match.infinite) {
      queryClient.setQueryData<InfiniteData<OfferingPage, number | undefined>>(
        query.queryKey,
        (data) => data && { ...data, pages: data.pages.map((page) => removeRow(page, offeringID)) },
      );
    } else {
      queryClient.setQueryData<OfferingPage>(
        query.queryKey,
        (page) => page && removeRow(page, offeringID),
      );
    }
    touched += 1;
  }
  return touched;
}
