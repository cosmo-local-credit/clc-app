import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getMarketVouchers, type MarketVoucher, viewportToBoundingBoxes } from "./market-client";

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

    await getMarketVouchers({ perPage: 500 });

    expect(requestedUrl()).toContain("/api/v2/vouchers?");
    expect(requestedUrl()).toContain("perPage=500");
    expect(requestedUrl()).not.toContain("cursor=");
  });

  it("builds the next-page URL from a cursor", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await getMarketVouchers({ perPage: 500, cursor: 2212, next: true });

    expect(requestedUrl()).toContain("perPage=500");
    expect(requestedUrl()).toContain("cursor=2212");
    expect(requestedUrl()).toContain("next=true");
  });

  it("sends no credentials and does not disable the browser cache", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await getMarketVouchers({ perPage: 500 });

    const init = requestedInit();
    // The catalog is public and representation-invariant: a cookie would only
    // poison the shared cache, and no-store would defeat max-age entirely.
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBeUndefined();
    expect(init.method).toBe("GET");
  });

  it("forwards the React Query abort signal", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));
    const controller = new AbortController();

    await getMarketVouchers({ perPage: 500 }, controller.signal);

    expect(requestedInit().signal).toBe(controller.signal);
  });

  it("serializes a bounding box as minLng,minLat,maxLng,maxLat", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    await getMarketVouchers({
      perPage: 500,
      bbox: { minLng: 36.6, minLat: -1.5, maxLng: 37.1, maxLat: -1.1 },
    });

    expect(decodeURIComponent(requestedUrl())).toContain("bbox=36.6,-1.5,37.1,-1.1");
  });
});

describe("getMarketVouchers normalization", () => {
  it("normalizes a valid page and preserves the cursors", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [VALID_ROW], first: 2710, last: 2212 }));

    const page = await getMarketVouchers({ perPage: 500 });

    expect(page.first).toBe(2710);
    expect(page.last).toBe(2212);
    expect(page.vouchers).toEqual<MarketVoucher[]>([
      {
        id: "2710",
        chainId: 42220,
        address: "0xAbC0000000000000000000000000000000000123",
        name: "Priscilah Malii",
        symbol: "VOUCHER",
        locationName: "C96, KEN",
        lat: -1.450979,
        lng: 38.235115,
        kind: "voucher",
      },
    ]);
  });

  it("preserves checksummed address casing", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [VALID_ROW], first: 1, last: 1 }));

    const page = await getMarketVouchers({ perPage: 500 });

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

    const page = await getMarketVouchers({ perPage: 500 });

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

  it("treats an absent voucher list as an empty page", async () => {
    fetchMock.mockResolvedValue(pageResponse({ first: 0, last: 0 }));

    const page = await getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toEqual([]);
    expect(page.first).toBe(0);
    expect(page.last).toBe(0);
  });

  it.each([
    ["a missing id", { ...VALID_ROW, id: undefined }],
    ["a malformed address", { ...VALID_ROW, address: "0xnope" }],
    ["a missing address", { ...VALID_ROW, address: null }],
    ["an unknown kind", { ...VALID_ROW, kind: "eatery" }],
    ["a missing kind", { ...VALID_ROW, kind: undefined }],
    ["a non-numeric latitude", { ...VALID_ROW, geoLat: "south" }],
    ["a null latitude", { ...VALID_ROW, geoLat: null }],
    ["an out-of-range latitude", { ...VALID_ROW, geoLat: 91 }],
    ["an out-of-range longitude", { ...VALID_ROW, geoLng: -181 }],
  ])("drops a row with %s rather than rendering a bad marker", async (_label, row) => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [row], first: 1, last: 1 }));

    const page = await getMarketVouchers({ perPage: 500 });

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

    const page = await getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toHaveLength(1);
    expect(page.vouchers[0]?.id).toBe("2710");
  });

  it("coerces missing cursors to zero so callers never see undefined", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [] }));

    const page = await getMarketVouchers({ perPage: 500 });

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
    // renderWorldCopies defaults to true, so bounds can exceed +/-180.
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
    // A single inverted box is invalid and must never be produced.
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
