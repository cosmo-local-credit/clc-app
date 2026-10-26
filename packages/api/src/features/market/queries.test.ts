import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { describe, expect, it, vi } from "vite-plus/test";
import type { MarketClient, MarketVoucherPage } from "./client";
import {
  nextMarketCursor,
  voucherCatalogInfiniteQueryOptions,
  voucherInfoQueryOptions,
  voucherKeys,
  voucherQueryOptions,
  voucherViewportQueryOptions,
} from "./queries";

const ADDRESS = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";
const BOX = { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 };
const FILTER: CatalogFilter = {
  term: "maize",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

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
      voucherKeys.info(ADDRESS, ADDRESS),
      voucherKeys.filtered(null, 20),
      voucherKeys.filteredPage({ perPage: 20, filter: FILTER }),
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

  it("isolates authenticated info by resource and wallet", () => {
    const viewer = `0x${"b".repeat(40)}`;
    expect(voucherKeys.info(ADDRESS, viewer)).toEqual(
      voucherKeys.info(ADDRESS.toUpperCase(), viewer.toUpperCase()),
    );
    expect(voucherKeys.info(ADDRESS, viewer)).not.toEqual(voucherKeys.info(ADDRESS, ADDRESS));
    expect(voucherKeys.info(ADDRESS, viewer)).not.toEqual(voucherKeys.detail(ADDRESS));
  });

  it("varies the viewport key with the boxes, since panning changes the result", () => {
    const other = { minLng: 5, minLat: 5, maxLng: 6, maxLat: 6 };
    expect(voucherKeys.viewport([BOX], 500)).not.toEqual(voucherKeys.viewport([other], 500));
    expect(voucherKeys.viewport([BOX], 500)).not.toEqual(voucherKeys.viewport([BOX, other], 500));
    expect(voucherKeys.viewport([BOX], 500)).not.toEqual(voucherKeys.viewport([BOX], 100));
  });

  it("varies search by term and by owner, sharing an entry across address casings", () => {
    expect(voucherKeys.search("maize")).not.toEqual(voucherKeys.search("beans"));
    expect(voucherKeys.search("maize")).not.toEqual(voucherKeys.search("maize", ADDRESS));
    expect(voucherKeys.search("maize", ADDRESS)).toEqual(
      voucherKeys.search("maize", ADDRESS.toLowerCase()),
    );
  });

  it("varies the filtered page with everything the backend filters on", () => {
    // A term is a server parameter, so two terms are two results. Sharing an
    // entry between them would show one term's rows under the other.
    expect(voucherKeys.filteredPage({ perPage: 20, filter: FILTER })).not.toEqual(
      voucherKeys.filteredPage({ perPage: 20, filter: { ...FILTER, term: "beans" } }),
    );
    expect(voucherKeys.filteredPage({ perPage: 20, filter: FILTER })).not.toEqual(
      voucherKeys.filteredPage({ perPage: 20, cursor: 480, next: true, filter: FILTER }),
    );
    // One page of a filtered list and a whole assembled catalog cache different
    // shapes, so they must not share a key.
    expect(voucherKeys.filteredPage({ perPage: 20, filter: FILTER })).not.toEqual(
      voucherKeys.filtered(FILTER, 20),
    );
  });

  it("isolates filtered caches by verified pool references and normalizes casing", () => {
    const pools = [{ chainId: 100, address: ADDRESS }];
    expect(voucherKeys.filtered(FILTER, 20, pools)).toEqual(
      voucherKeys.filtered(FILTER, 20, [{ chainId: 100, address: ADDRESS.toLowerCase() }]),
    );
    expect(voucherKeys.filtered(FILTER, 20, pools)).not.toEqual(voucherKeys.filtered(FILTER, 20));
    expect(voucherKeys.filteredPage({ perPage: 20, filter: FILTER, pools })).not.toEqual(
      voucherKeys.filteredPage({ perPage: 20, filter: FILTER }),
    );
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
    expect(voucherInfoQueryOptions({} as MarketClient, ADDRESS, undefined).enabled).toBe(false);
    expect(voucherInfoQueryOptions({} as MarketClient, undefined, ADDRESS).enabled).toBe(false);
  });

  it("forwards cancellation to authenticated voucher info", async () => {
    const getVoucherInfo = vi.fn().mockResolvedValue({ address: ADDRESS });
    const options = voucherInfoQueryOptions(
      { getVoucherInfo } as unknown as MarketClient,
      ADDRESS,
      ADDRESS,
    );
    const signal = new AbortController().signal;
    await options.queryFn?.({ signal } as never);
    expect(getVoucherInfo).toHaveBeenCalledWith(ADDRESS, signal);
  });

  it("stays disabled with no viewport boxes rather than requesting the whole world", () => {
    expect(voucherViewportQueryOptions({} as MarketClient, [], 500).enabled).toBe(false);
    expect(voucherViewportQueryOptions({} as MarketClient, [BOX], 500).enabled).toBe(true);
  });

  it("forwards viewport bounds and returns only the voucher rows", async () => {
    const vouchers = [{ id: "7" }];
    const getMarketVouchers = vi.fn().mockResolvedValue({ vouchers, first: 7, last: 7 });
    const options = voucherViewportQueryOptions(
      { getMarketVouchers } as unknown as MarketClient,
      [BOX],
      100,
      { scope: "viewport", nearby: true },
    );
    const signal = new AbortController().signal;

    await expect(options.queryFn?.({ signal } as never)).resolves.toBe(vouchers);
    expect(getMarketVouchers).toHaveBeenCalledWith(
      { perPage: 100, bounds: [BOX], nearby: true },
      signal,
    );
  });

  it("starts the catalog with no cursor", () => {
    expect(
      voucherCatalogInfiniteQueryOptions({} as MarketClient, 500).initialPageParam,
    ).toBeUndefined();
  });
});
