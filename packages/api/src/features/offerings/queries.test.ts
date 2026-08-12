import { describe, expect, it } from "vite-plus/test";
import type { OfferingPage, OfferingsClient } from "./client";
import {
  nextOfferingCursor,
  offeringKeys,
  poolOfferingsInfiniteQueryOptions,
  voucherOfferingsInfiniteQueryOptions,
} from "./queries";

const ADDRESS = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";

function page(received: number, last: number): OfferingPage {
  return { offerings: [], first: 0, last, receivedCount: received };
}

describe("offeringKeys", () => {
  it("hangs every key off `all`", () => {
    for (const key of [
      offeringKeys.byVoucher(ADDRESS, 20),
      offeringKeys.byVoucherInfinite(ADDRESS),
      offeringKeys.byPool(ADDRESS, 20),
      offeringKeys.byPoolInfinite(ADDRESS),
    ]) {
      expect(key.slice(0, offeringKeys.all.length)).toEqual([...offeringKeys.all]);
    }
  });

  it("keeps voucher-scoped and pool-scoped reads apart", () => {
    // The same address could name either, and they are different resources.
    expect(offeringKeys.byVoucherInfinite(ADDRESS)).not.toEqual(
      offeringKeys.byPoolInfinite(ADDRESS),
    );
  });

  it("gives finite and infinite reads distinct keys", () => {
    expect(offeringKeys.byVoucher(ADDRESS, 20)).not.toEqual(
      offeringKeys.byVoucherInfinite(ADDRESS),
    );
  });

  it("normalizes address casing", () => {
    expect(offeringKeys.byVoucherInfinite(ADDRESS)).toEqual(
      offeringKeys.byVoucherInfinite(ADDRESS.toLowerCase()),
    );
  });
});

describe("nextOfferingCursor", () => {
  const next = nextOfferingCursor(20);

  it("continues while pages stay full and the cursor strictly decreases", () => {
    expect(next(page(20, 40), [page(20, 60), page(20, 40)])).toBe(40);
  });

  it("stops on a short page", () => {
    expect(next(page(19, 40), [page(19, 40)])).toBeUndefined();
  });

  it("stops on a zero cursor", () => {
    expect(next(page(20, 0), [page(20, 0)])).toBeUndefined();
  });

  it("stops when the cursor fails to decrease, rather than paging forever", () => {
    expect(next(page(20, 40), [page(20, 40), page(20, 40)])).toBeUndefined();
    expect(next(page(20, 50), [page(20, 40), page(20, 50)])).toBeUndefined();
  });
});

describe("scoped options", () => {
  it("stays disabled without an address", () => {
    expect(voucherOfferingsInfiniteQueryOptions({} as OfferingsClient, undefined, 20).enabled).toBe(
      false,
    );
    expect(poolOfferingsInfiniteQueryOptions({} as OfferingsClient, undefined, 20).enabled).toBe(
      false,
    );
  });
});
