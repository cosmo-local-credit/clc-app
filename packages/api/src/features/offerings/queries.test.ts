import { describe, expect, it, vi } from "vite-plus/test";
import type { OfferingPage, OfferingsClient } from "./client";
import {
  nextOfferingCursor,
  offeringKeys,
  offeringsDiscoveryInfiniteQueryOptions,
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
      offeringKeys.byVoucherInfinite(ADDRESS, 20),
      offeringKeys.byPool(ADDRESS, 20),
      offeringKeys.byPoolInfinite(ADDRESS, 20),
      offeringKeys.discovery({ perPage: 20 }),
    ]) {
      expect(key.slice(0, offeringKeys.all.length)).toEqual([...offeringKeys.all]);
    }
  });

  it("keeps voucher-scoped and pool-scoped reads apart", () => {
    // The same address could name either, and they are different resources.
    expect(offeringKeys.byVoucherInfinite(ADDRESS, 20)).not.toEqual(
      offeringKeys.byPoolInfinite(ADDRESS, 20),
    );
  });

  it("gives finite and infinite reads distinct keys", () => {
    expect(offeringKeys.byVoucher(ADDRESS, 20)).not.toEqual(
      offeringKeys.byVoucherInfinite(ADDRESS, 20),
    );
  });

  it("normalizes address casing", () => {
    expect(offeringKeys.byVoucherInfinite(ADDRESS, 20)).toEqual(
      offeringKeys.byVoucherInfinite(ADDRESS.toLowerCase(), 20),
    );
  });

  it("separates infinite reads by page size", () => {
    // perPage decides both the request size and the cursor termination rule, so
    // two page sizes sharing one InfiniteData would give at least one of them
    // page boundaries it never asked for.
    expect(offeringKeys.byVoucherInfinite(ADDRESS, 20)).not.toEqual(
      offeringKeys.byVoucherInfinite(ADDRESS, 50),
    );
    expect(offeringKeys.byPoolInfinite(ADDRESS, 20)).not.toEqual(
      offeringKeys.byPoolInfinite(ADDRESS, 50),
    );
  });

  it("isolates discovery by search, scope, tags, and verified pools", () => {
    const base = {
      perPage: 20,
      q: " maize ",
      tags: ["food"],
      scope: "account:1:2:100",
      pools: [{ chainId: 100, address: ADDRESS }],
    };
    expect(offeringKeys.discovery(base)).toEqual(
      offeringKeys.discovery({
        ...base,
        q: "maize",
        pools: [{ chainId: 100, address: ADDRESS.toLowerCase() }],
      }),
    );
    expect(offeringKeys.discovery(base)).not.toEqual(
      offeringKeys.discovery({ ...base, q: "beans" }),
    );
    expect(offeringKeys.discovery(base)).not.toEqual(
      offeringKeys.discovery({ ...base, scope: "account:3:4:100" }),
    );
    expect(offeringKeys.discovery(base)).not.toEqual(
      offeringKeys.discovery({ ...base, pools: [] }),
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

  it("passes opaque discovery cursors to the client unchanged", async () => {
    const getOfferings = vi.fn().mockResolvedValue({
      offerings: [],
      nextCursor: null,
      receivedCount: 0,
      tagFacets: null,
    });
    const options = offeringsDiscoveryInfiniteQueryOptions(
      { getOfferings } as unknown as OfferingsClient,
      { perPage: 20, q: "maize", scope: "saved:1:2:100" },
    );

    await options.queryFn?.({
      pageParam: "opaque+/=",
      signal: new AbortController().signal,
    } as never);

    expect(getOfferings).toHaveBeenCalledWith(
      { perPage: 20, q: "maize", cursor: "opaque+/=" },
      expect.any(AbortSignal),
    );
  });
});
