import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createMarketClient } from "./client";

import { type MarketVoucher, viewportToBoundingBoxes } from "./client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createMarketClient(createHttpClient({ baseUrl: "https://api.test" }));

const fetchMock = vi.fn();

function pageResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () =>
      Promise.resolve(JSON.stringify({ ok: true, description: "Market vouchers", result })),
  } as Response;
}

const VALID_ROW = {
  id: 2710,
  chainId: 42220,
  address: "0xAbC0000000000000000000000000000000000123",
  name: "Priscilah Malii",
  symbol: "VOUCHER",
  iconUrl: "https://content.example/icon.jpg",
  locationName: "C96, KEN",
  geoLat: -1.450979,
  geoLng: 38.235115,
  kind: "voucher",
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function requestedUrl(call = 0): string {
  return String(fetchMock.mock.calls[call]?.[0]);
}

function requestedInit(call = 0): RequestInit {
  return (fetchMock.mock.calls[call]?.[1] ?? {}) as RequestInit;
}

describe("getMarketVouchers request", () => {
  it("builds the first-page URL", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getMarketVouchers({ perPage: 500 });

    expect(requestedUrl()).toContain("/api/v2/vouchers?");
    expect(requestedUrl()).toContain("perPage=500");
    expect(requestedUrl()).not.toContain("cursor=");
  });

  it("builds the next-page URL from a cursor", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getMarketVouchers({ perPage: 500, cursor: 2212, next: true });

    expect(requestedUrl()).toContain("perPage=500");
    expect(requestedUrl()).toContain("cursor=2212");
    expect(requestedUrl()).toContain("next=true");
  });

  it("sends no credentials and does not disable the browser cache", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getMarketVouchers({ perPage: 500 });

    const init = requestedInit();
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBeUndefined();
    expect(init.method).toBe("GET");
  });

  it("forwards the React Query abort signal", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));
    const controller = new AbortController();

    await api.getMarketVouchers({ perPage: 500 }, controller.signal);

    expect(requestedInit().signal).toBe(controller.signal);
  });

  it("serializes a bounding box as minLng,minLat,maxLng,maxLat", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getMarketVouchers({
      perPage: 500,
      bbox: { minLng: 36.6, minLat: -1.5, maxLng: 37.1, maxLat: -1.1 },
    });

    expect(decodeURIComponent(requestedUrl())).toContain("bbox=36.6,-1.5,37.1,-1.1");
  });
});

describe("getMarketVouchers normalization", () => {
  it("normalizes a valid page and preserves the cursors", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [VALID_ROW], first: 2710, last: 2212 }));

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.first).toBe(2710);
    expect(page.last).toBe(2212);
    expect(page.vouchers).toEqual<MarketVoucher[]>([
      {
        id: "2710",
        chainId: 42220,
        address: "0xAbC0000000000000000000000000000000000123",
        name: "Priscilah Malii",
        symbol: "VOUCHER",
        iconUrl: "https://content.example/icon.jpg",
        locationName: "C96, KEN",
        lat: -1.450979,
        lng: 38.235115,
        kind: "voucher",
      },
    ]);
  });

  it("preserves checksummed address casing", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [VALID_ROW], first: 1, last: 1 }));

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.vouchers[0]?.address).toBe("0xAbC0000000000000000000000000000000000123");
  });

  it("trims text and substitutes defaults only for missing name and symbol", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [
          { ...VALID_ROW, name: "  Spaced  ", symbol: "  SYM ", locationName: "   " },
          { ...VALID_ROW, id: 99, name: null, symbol: "", locationName: null },
        ],
        first: 2710,
        last: 99,
      }),
    );

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.vouchers[0]).toMatchObject({
      name: "Spaced",
      symbol: "SYM",
      locationName: null,
    });
    expect(page.vouchers[1]).toMatchObject({
      name: "Community Voucher",
      symbol: "VOUCHER",
      locationName: null,
    });
  });

  it("rejects an unsafe catalog icon URL without dropping the voucher", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [{ ...VALID_ROW, iconUrl: "javascript:alert(1)" }],
        first: 2710,
        last: 2710,
      }),
    );

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toHaveLength(1);
    expect(page.vouchers[0]?.iconUrl).toBeNull();
  });

  it("treats an absent voucher list as an empty page", async () => {
    fetchMock.mockResolvedValue(pageResponse({ first: 0, last: 0 }));

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toEqual([]);
    expect(page.first).toBe(0);
    expect(page.last).toBe(0);
  });

  it.each([
    ["a missing id", { ...VALID_ROW, id: undefined }],
    ["a malformed address", { ...VALID_ROW, address: "0xnope" }],
    ["a missing address", { ...VALID_ROW, address: null }],
    ["a zero chain id", { ...VALID_ROW, chainId: 0 }],
    ["a fractional chain id", { ...VALID_ROW, chainId: 42220.5 }],
    ["an unsafe chain id", { ...VALID_ROW, chainId: Number.MAX_SAFE_INTEGER + 1 }],
    ["an unknown kind", { ...VALID_ROW, kind: "eatery" }],
    ["a missing kind", { ...VALID_ROW, kind: undefined }],
    ["a non-numeric latitude", { ...VALID_ROW, geoLat: "south" }],
    ["a null latitude", { ...VALID_ROW, geoLat: null }],
    ["an out-of-range latitude", { ...VALID_ROW, geoLat: 91 }],
    ["an out-of-range longitude", { ...VALID_ROW, geoLng: -181 }],
  ])("drops a row with %s rather than rendering a bad marker", async (_label, row) => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [row], first: 1, last: 1 }));

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toEqual([]);
  });

  it("keeps the good rows when one row is malformed", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [VALID_ROW, { ...VALID_ROW, id: 5, address: "nope" }],
        first: 2710,
        last: 5,
      }),
    );

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toHaveLength(1);
    expect(page.vouchers[0]?.id).toBe("2710");
  });

  it("coerces missing cursors to zero so callers never see undefined", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [] }));

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.first).toBe(0);
    expect(page.last).toBe(0);
  });
});

describe("viewportToBoundingBoxes", () => {
  it("returns a single box for an ordinary viewport", () => {
    expect(viewportToBoundingBoxes({ west: 36.6, south: -1.5, east: 37.1, north: -1.1 })).toEqual([
      { minLng: 36.6, minLat: -1.5, maxLng: 37.1, maxLat: -1.1 },
    ]);
  });

  it("normalizes longitudes past the dateline from renderWorldCopies", () => {
    const [box] = viewportToBoundingBoxes({ west: 396.6, south: -1.5, east: 397.1, north: -1.1 });

    expect(box?.minLng).toBeCloseTo(36.6, 6);
    expect(box?.maxLng).toBeCloseTo(37.1, 6);
  });

  it("splits an antimeridian-crossing viewport into two valid boxes", () => {
    const boxes = viewportToBoundingBoxes({ west: 179, south: -1.5, east: -179, north: -1.1 });

    expect(boxes).toHaveLength(2);
    expect(boxes).toEqual([
      { minLng: 179, minLat: -1.5, maxLng: 180, maxLat: -1.1 },
      { minLng: -180, minLat: -1.5, maxLng: -179, maxLat: -1.1 },
    ]);
    for (const box of boxes) {
      expect(box.minLng).toBeLessThanOrEqual(box.maxLng);
      expect(box.minLat).toBeLessThanOrEqual(box.maxLat);
    }
  });

  it("collapses a whole-world viewport to one box", () => {
    expect(viewportToBoundingBoxes({ west: -400, south: -95, east: 400, north: 95 })).toEqual([
      { minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 },
    ]);
  });

  it("clamps latitudes to the valid range", () => {
    const [box] = viewportToBoundingBoxes({ west: 10, south: -120, east: 20, north: 120 });

    expect(box?.minLat).toBe(-90);
    expect(box?.maxLat).toBe(90);
  });

  it("returns nothing for a non-finite viewport", () => {
    expect(viewportToBoundingBoxes({ west: Number.NaN, south: -1, east: 1, north: 1 })).toEqual([]);
  });
});

describe("getMarketVouchers page size reporting", () => {
  it("reports the raw row count the backend returned, not the kept count", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [VALID_ROW, { ...VALID_ROW, id: 5, address: "nope" }],
        first: 2710,
        last: 5,
      }),
    );

    const page = await api.getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toHaveLength(1);
    expect(page.receivedCount).toBe(2);
  });

  it("reports zero for an empty page", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    expect((await api.getMarketVouchers({ perPage: 500 })).receivedCount).toBe(0);
  });
});

const DETAIL_ROW = {
  id: 2710,
  chainId: 42220,
  address: "0xAbC0000000000000000000000000000000000123",
  name: "Priscilah Malii",
  symbol: "MALII",
  decimals: 6,
  ownerAddress: "0xDeF0000000000000000000000000000000000456",
  description: "Community voucher",
  voucherUoa: "KSH",
  voucherValue: "10",
  locationName: "C96, KEN",
  geoLat: -1.450979,
  geoLng: 38.235115,
  email: "issuer@example.org",
  website: "https://example.org",
  phone: "+254700000000",
  iconUrl: "https://content.example/icon.jpg",
  bannerUrl: "https://content.example/banner.jpg",
  kind: "goods",
};

function detailResponse(voucher: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () =>
      Promise.resolve(
        JSON.stringify({ ok: true, description: "Market voucher", result: { voucher } }),
      ),
  } as Response;
}

describe("getMarketVoucher", () => {
  it("reads the voucher the card and the page render", async () => {
    fetchMock.mockResolvedValue(detailResponse(DETAIL_ROW));

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(requestedUrl()).toContain(`/api/v2/vouchers/${DETAIL_ROW.address}`);
    expect(voucher).toMatchObject({
      id: "2710",
      chainId: 42220,
      address: "0xAbC0000000000000000000000000000000000123",
      name: "Priscilah Malii",
      symbol: "MALII",
      voucherUoa: "KSH",
      voucherValue: "10",
      email: "issuer@example.org",
      iconUrl: "https://content.example/icon.jpg",
      bannerUrl: "https://content.example/banner.jpg",
      lat: -1.450979,
      lng: 38.235115,
      kind: "goods",
    });
  });

  it("returns null for every field the catalog left empty", async () => {
    fetchMock.mockResolvedValue(
      detailResponse({
        id: 2710,
        chainId: 42220,
        address: DETAIL_ROW.address,
        kind: "voucher",
      }),
    );

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(voucher).toMatchObject({
      iconUrl: null,
      bannerUrl: null,
      email: null,
      website: null,
      phone: null,
      ownerAddress: null,
      description: null,
      voucherUoa: null,
      voucherValue: null,
      locationName: null,
      lat: null,
      lng: null,
    });
    expect(voucher.name).toBe("Community Voucher");
    expect(voucher.symbol).toBe("VOUCHER");
    // Never null, unlike every field above: a caller iterating tags must not have
    // to tell an untagged voucher from a response that predates the field.
    expect(voucher.tags).toEqual([]);
    expect(voucher.terms).toBeNull();
  });

  it("reads the terms and tags an operator edits", async () => {
    fetchMock.mockResolvedValue(
      detailResponse({
        ...DETAIL_ROW,
        terms: "https://malii.example/terms",
        tags: ["Agriculture", "Food"],
      }),
    );

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(voucher.terms).toBe("https://malii.example/terms");
    expect(voucher.tags).toEqual(["Agriculture", "Food"]);
  });

  it("drops anything in tags that is not a usable string", async () => {
    // The array reaches here straight off the wire. A number or a blank in it
    // would be rendered as a chip nobody can filter by.
    fetchMock.mockResolvedValue(
      detailResponse({ ...DETAIL_ROW, tags: ["Food", "", 7, null, "Care"] }),
    );

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(voucher.tags).toEqual(["Food", "Care"]);
  });

  it("treats a non-array tags value as no tags", async () => {
    fetchMock.mockResolvedValue(detailResponse({ ...DETAIL_ROW, tags: "Food" }));

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(voucher.tags).toEqual([]);
  });

  it.each([
    ["javascript", "javascript:alert(1)"],
    ["data", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["protocol-relative", "//content.example/icon.jpg"],
    ["site-relative", "/icon.jpg"],
    ["not a url", "content.example/icon.jpg"],
  ])("rejects a %s image URL", async (_label, iconUrl) => {
    fetchMock.mockResolvedValue(detailResponse({ ...DETAIL_ROW, iconUrl, bannerUrl: iconUrl }));

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(voucher.iconUrl).toBeNull();
    expect(voucher.bannerUrl).toBeNull();
  });

  it("keeps an absolute http and https image URL", async () => {
    fetchMock.mockResolvedValue(
      detailResponse({
        ...DETAIL_ROW,
        iconUrl: "http://content.example/icon.jpg",
        bannerUrl: "https://content.example/banner.jpg",
      }),
    );

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(voucher.iconUrl).toBe("http://content.example/icon.jpg");
    expect(voucher.bannerUrl).toBe("https://content.example/banner.jpg");
  });

  it.each([
    ["only latitude", { geoLat: -1.45, geoLng: null }],
    ["only longitude", { geoLat: null, geoLng: 38.23 }],
    ["latitude out of range", { geoLat: 91, geoLng: 38.23 }],
    ["longitude out of range", { geoLat: -1.45, geoLng: 181 }],
  ])("drops both coordinates given %s", async (_label, coords) => {
    fetchMock.mockResolvedValue(detailResponse({ ...DETAIL_ROW, ...coords }));

    const voucher = await api.getMarketVoucher(DETAIL_ROW.address);

    expect(voucher.lat).toBeNull();
    expect(voucher.lng).toBeNull();
  });

  it.each([
    ["an absent voucher", undefined],
    ["a null voucher", null],
    ["a malformed address", { ...DETAIL_ROW, address: "nope" }],
    ["a missing id", { ...DETAIL_ROW, id: undefined }],
  ])("throws on %s so the page shows its error state", async (_label, voucher) => {
    fetchMock.mockResolvedValue(detailResponse(voucher));

    await expect(api.getMarketVoucher(DETAIL_ROW.address)).rejects.toThrow();
  });

  it("falls back to the voucher kind rather than failing", async () => {
    fetchMock.mockResolvedValue(detailResponse({ ...DETAIL_ROW, kind: "eatery" }));

    expect((await api.getMarketVoucher(DETAIL_ROW.address)).kind).toBe("voucher");
  });

  it("keeps the address inside one path segment", async () => {
    fetchMock.mockResolvedValue(detailResponse(DETAIL_ROW));

    await api.getMarketVoucher("../vouchers?perPage=1");

    const url = new URL(requestedUrl());
    expect(url.pathname).toBe("/api/v2/vouchers/..%2Fvouchers%3FperPage%3D1");
    expect(url.search).toBe("");
  });

  it("sends no credentials, so a shared cache stays usable", async () => {
    fetchMock.mockResolvedValue(detailResponse(DETAIL_ROW));

    await api.getMarketVoucher(DETAIL_ROW.address);

    expect(requestedInit().credentials).toBe("omit");
    expect(requestedInit().cache).toBeUndefined();
  });
});

describe("getFilteredMarketVouchers request", () => {
  const FILTER = {
    term: "",
    tags: [] as readonly string[],
    tagMatch: "any" as const,
    vouchers: [] as const,
    voucherMatch: "any" as const,
  };

  it("encodes a term and comma-joins tags in one key", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getFilteredMarketVouchers({
      perPage: 500,
      filter: { ...FILTER, term: "sarafu network", tags: ["Art", "Food production"] },
    });

    const url = new URL(requestedUrl());
    expect(url.searchParams.get("q")).toBe("sarafu network");
    expect(url.searchParams.get("tags")).toBe("Art,Food production");
    expect(url.searchParams.getAll("tags")).toHaveLength(1);
    expect(url.searchParams.get("perPage")).toBe("500");
  });

  it("omits a filter key it has nothing to say about", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getFilteredMarketVouchers({ perPage: 500, filter: FILTER });

    const url = new URL(requestedUrl());
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("tags")).toBe(false);
    expect(url.searchParams.has("tagMatch")).toBe(false);
    expect(url.searchParams.has("facets")).toBe(false);
  });

  it("sends tagMatch only when two or more tags make the modes differ", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getFilteredMarketVouchers({
      perPage: 500,
      filter: { ...FILTER, tags: ["Art"], tagMatch: "all" },
    });
    expect(new URL(requestedUrl(0)).searchParams.has("tagMatch")).toBe(false);

    await api.getFilteredMarketVouchers({
      perPage: 500,
      filter: { ...FILTER, tags: ["Art", "Culture"], tagMatch: "all" },
    });
    expect(new URL(requestedUrl(1)).searchParams.get("tagMatch")).toBe("all");
  });

  it("sends facets only as the literal true the backend accepts", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getFilteredMarketVouchers({ perPage: 1, filter: FILTER, facets: true });
    expect(new URL(requestedUrl(0)).searchParams.get("facets")).toBe("true");

    await api.getFilteredMarketVouchers({ perPage: 1, filter: FILTER, facets: false });
    expect(new URL(requestedUrl(1)).searchParams.has("facets")).toBe(false);
  });

  it("carries the cursor and next flag for a later page of the walk", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getFilteredMarketVouchers({ perPage: 500, cursor: 2501, next: true, filter: FILTER });

    const url = new URL(requestedUrl());
    expect(url.searchParams.get("cursor")).toBe("2501");
    expect(url.searchParams.get("next")).toBe("true");
  });

  it("encodes a bounding box alongside the filter", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await api.getFilteredMarketVouchers({
      perPage: 500,
      bbox: { minLng: 36.6, minLat: -1.5, maxLng: 37.1, maxLat: -1.1 },
      filter: { ...FILTER, term: "art" },
    });

    const url = new URL(requestedUrl());
    expect(url.searchParams.get("bbox")).toBe("36.6,-1.5,37.1,-1.1");
    expect(url.searchParams.get("q")).toBe("art");
  });

  it("sends no credentials and forwards the abort signal", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));
    const controller = new AbortController();

    await api.getFilteredMarketVouchers({ perPage: 500, filter: FILTER }, controller.signal);

    expect(requestedInit().credentials).toBe("omit");
    expect(requestedInit().cache).toBeUndefined();
    expect(requestedInit().signal).toBe(controller.signal);
  });
});

describe("getFilteredMarketVouchers response", () => {
  const FILTER = {
    term: "art",
    tags: [] as readonly string[],
    tagMatch: "any" as const,
    vouchers: [] as const,
    voucherMatch: "any" as const,
  };

  it("normalizes the tag facet", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [VALID_ROW],
        first: 2710,
        last: 2710,
        tagFacets: [
          { tag: "Art", count: 3 },
          { tag: "Culture", count: 0 },
        ],
      }),
    );

    const page = await api.getFilteredMarketVouchers({ perPage: 500, filter: FILTER });

    expect(page.tagFacets).toEqual([
      { tag: "Art", count: 3 },
      { tag: "Culture", count: 0 },
    ]);
  });

  it("distinguishes an absent facet from an empty one", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));
    expect(
      (await api.getFilteredMarketVouchers({ perPage: 500, filter: FILTER })).tagFacets,
    ).toBeNull();

    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0, tagFacets: [] }));
    expect(
      (await api.getFilteredMarketVouchers({ perPage: 500, filter: FILTER })).tagFacets,
    ).toEqual([]);
  });

  it("drops malformed facet rows rather than rendering them", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [],
        first: 0,
        last: 0,
        tagFacets: [
          { tag: "Art", count: 3 },
          { tag: "", count: 1 },
          { tag: "NoCount" },
          { tag: "Negative", count: -1 },
          { count: 2 },
        ],
      }),
    );

    const page = await api.getFilteredMarketVouchers({ perPage: 500, filter: FILTER });

    expect(page.tagFacets).toEqual([{ tag: "Art", count: 3 }]);
  });

  it("reports the count the backend sent, before normalization dropped rows", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({ vouchers: [VALID_ROW, { id: 1 }], first: 2710, last: 1 }),
    );

    const page = await api.getFilteredMarketVouchers({ perPage: 500, filter: FILTER });

    expect(page.vouchers).toHaveLength(1);
    expect(page.receivedCount).toBe(2);
  });
});

describe("catalog HTTP cache policy", () => {
  const fresh = createMarketClient(createHttpClient({ baseUrl: "https://api.test" }), {
    cache: "no-store",
  });

  // The endpoints answer `Cache-Control: public, max-age=60,
  // stale-while-revalidate=300`. A console that writes what it reads must opt out,
  // or an operator's own edit is replaced by the pre-write body the browser
  // cached: the write returns 200, the row is correct, and the screen still shows
  // the old value. Asserting the request's `cache` is the only way to catch that —
  // jsdom has no HTTP cache, so no amount of rendering reproduces it.
  it("sends no-store on every catalog read when the app asks for it", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));
    await fresh.getMarketVouchers({ perPage: 10 });
    expect(requestedInit().cache).toBe("no-store");

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(pageResponse({ voucher: { ...VALID_ROW, id: 1 } }));
    await fresh.getMarketVoucher(VALID_ROW.address);
    expect(requestedInit().cache).toBe("no-store");

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));
    await fresh.getFilteredMarketVouchers({
      perPage: 10,
      filter: { term: "", tags: [], tagMatch: "any", vouchers: [], voucherMatch: "any" },
    });
    expect(requestedInit().cache).toBe("no-store");
  });

  // The default must stay absent, not "default": apps/web wants that cache, and
  // the header exists so a phone panning a map does not re-fetch the catalog.
  it("leaves the cache to the platform by default", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));
    await api.getMarketVouchers({ perPage: 10 });
    expect("cache" in requestedInit()).toBe(false);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(pageResponse({ voucher: { ...VALID_ROW, id: 1 } }));
    await api.getMarketVoucher(VALID_ROW.address);
    expect("cache" in requestedInit()).toBe(false);
  });
});
