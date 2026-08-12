import { describe, expect, it } from "vite-plus/test";
import type { MarketClient, MarketVoucherPage } from "./client";
import {
  nextMarketCursor,
  voucherCatalogInfiniteQueryOptions,
  voucherKeys,
  voucherQueryOptions,
  voucherViewportQueryOptions,
} from "./queries";

const ADDRESS = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";
const BOX = { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 };

function page(received: number, last: number): MarketVoucherPage {
  return { vouchers: [], first: 0, last, receivedCount: received };
}

describe("voucherKeys", () => {
  it("hangs every key off `all` so one invalidation reaches them", () => {
    // A voucher deploy invalidates voucherKeys.all; a key outside that prefix
    // would keep serving pre-deploy data.
    for (const key of [
      voucherKeys.list({ perPage: 20 }),
      voucherKeys.catalog(500),
      voucherKeys.viewport([BOX], 500),
      voucherKeys.detail(ADDRESS),
      voucherKeys.filtered(null, 20),
      voucherKeys.facetVocabulary(),
      voucherKeys.search("maize"),
    ]) {
      expect(key.slice(0, voucherKeys.all.length)).toEqual([...voucherKeys.all]);
    }
  });

  it("gives the finite list and the infinite catalog distinct keys", () => {
    expect(voucherKeys.list({ perPage: 500 })).not.toEqual(voucherKeys.catalog(500));
  });

  it("shares one detail entry across address casings", () => {
    // The map card and the voucher page must hit the same cache entry so
    // navigation lands on data already loaded.
    expect(voucherKeys.detail(ADDRESS)).toEqual(voucherKeys.detail(ADDRESS.toLowerCase()));
    expect(voucherKeys.detail(ADDRESS)).toEqual(voucherKeys.detail(ADDRESS.toUpperCase()));
  });

  it("varies the viewport key with the boxes, since panning changes the result", () => {
    const other = { minLng: 5, minLat: 5, maxLng: 6, maxLat: 6 };
    expect(voucherKeys.viewport([BOX], 500)).not.toEqual(voucherKeys.viewport([other], 500));
    expect(voucherKeys.viewport([BOX], 500)).not.toEqual(voucherKeys.viewport([BOX, other], 500));
    expect(voucherKeys.viewport([BOX], 500)).not.toEqual(voucherKeys.viewport([BOX], 100));
  });

  it("varies search by term", () => {
    expect(voucherKeys.search("maize")).not.toEqual(voucherKeys.search("beans"));
  });
});

describe("nextMarketCursor", () => {
  const next = nextMarketCursor(500);

  it("continues from the last cursor while pages stay full and advance", () => {
    expect(next(page(500, 900), [page(500, 1000), page(500, 900)])).toBe(900);
  });

  it("stops on a short page", () => {
    expect(next(page(499, 900), [page(499, 900)])).toBeUndefined();
  });

  it("stops when the cursor reaches zero", () => {
    expect(next(page(500, 0), [page(500, 0)])).toBeUndefined();
  });

  it("stops when the cursor fails to advance, rather than paging forever", () => {
    // A backend returning the same or a higher cursor would otherwise loop.
    expect(next(page(500, 900), [page(500, 900), page(500, 900)])).toBeUndefined();
    expect(next(page(500, 950), [page(500, 900), page(500, 950)])).toBeUndefined();
  });

  it("has no previous page to compare on the first call", () => {
    expect(next(page(500, 900), [page(500, 900)])).toBe(900);
  });
});

describe("scoped options", () => {
  it("stays disabled without an address", () => {
    expect(voucherQueryOptions({} as MarketClient, undefined).enabled).toBe(false);
    expect(voucherQueryOptions({} as MarketClient, ADDRESS).enabled).toBe(true);
  });

  it("stays disabled with no viewport boxes rather than requesting the whole world", () => {
    expect(voucherViewportQueryOptions({} as MarketClient, [], 500).enabled).toBe(false);
    expect(voucherViewportQueryOptions({} as MarketClient, [BOX], 500).enabled).toBe(true);
  });

  it("starts the catalog with no cursor", () => {
    expect(
      voucherCatalogInfiniteQueryOptions({} as MarketClient, 500).initialPageParam,
    ).toBeUndefined();
  });
});
