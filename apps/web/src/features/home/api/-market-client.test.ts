import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  getMarketVoucher,
  getMarketVouchers,
  type MarketVoucher,
  viewportToBoundingBoxes,
} from "./market-client";

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

  it("rejects an unsafe catalog icon URL without dropping the voucher", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [{ ...VALID_ROW, iconUrl: "javascript:alert(1)" }],
        first: 2710,
        last: 2710,
      }),
    );

    const page = await getMarketVouchers({ perPage: 500 });

    expect(page.vouchers).toHaveLength(1);
    expect(page.vouchers[0]?.iconUrl).toBeNull();
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

describe("getMarketVouchers page size reporting", () => {
  it("reports the raw row count the backend returned, not the kept count", async () => {
    fetchMock.mockResolvedValue(
      pageResponse({
        vouchers: [VALID_ROW, { ...VALID_ROW, id: 5, address: "nope" }],
        first: 2710,
        last: 5,
      }),
    );

    const page = await getMarketVouchers({ perPage: 500 });

    // Pagination terminates on a short page. If the dropped row shrank the
    // reported size, one malformed voucher would hide the entire rest of the
    // catalog behind it.
    expect(page.vouchers).toHaveLength(1);
    expect(page.receivedCount).toBe(2);
  });

  it("reports zero for an empty page", async () => {
    fetchMock.mockResolvedValue(pageResponse({ vouchers: [], first: 0, last: 0 }));

    expect((await getMarketVouchers({ perPage: 500 })).receivedCount).toBe(0);
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

    const voucher = await getMarketVoucher(DETAIL_ROW.address);

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

  // Roughly two thirds of the imported catalog has no icon, banner, phone, or
  // coordinates. Absent must arrive as null so the UI can pick a fallback,
  // never as an empty string that renders as a broken image.
  it("returns null for every field the catalog left empty", async () => {
    fetchMock.mockResolvedValue(
      detailResponse({
        id: 2710,
        chainId: 42220,
        address: DETAIL_ROW.address,
        kind: "voucher",
      }),
    );

    const voucher = await getMarketVoucher(DETAIL_ROW.address);

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
    // Name and symbol still fall back, because something has to be the heading.
    expect(voucher.name).toBe("Community Voucher");
    expect(voucher.symbol).toBe("VOUCHER");
  });

  // Image URLs are imported third-party strings that go straight into an
  // <img src>. Only absolute http(s) is accepted rather than trusting that a
  // scripting scheme is inert in an image context.
  it.each([
    ["javascript", "javascript:alert(1)"],
    ["data", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["protocol-relative", "//content.example/icon.jpg"],
    ["site-relative", "/icon.jpg"],
    ["not a url", "content.example/icon.jpg"],
  ])("rejects a %s image URL", async (_label, iconUrl) => {
    fetchMock.mockResolvedValue(detailResponse({ ...DETAIL_ROW, iconUrl, bannerUrl: iconUrl }));

    const voucher = await getMarketVoucher(DETAIL_ROW.address);

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

    const voucher = await getMarketVoucher(DETAIL_ROW.address);

    expect(voucher.iconUrl).toBe("http://content.example/icon.jpg");
    expect(voucher.bannerUrl).toBe("https://content.example/banner.jpg");
  });

  // Half a coordinate would pin the voucher on a meridian somewhere it is not.
  it.each([
    ["only latitude", { geoLat: -1.45, geoLng: null }],
    ["only longitude", { geoLat: null, geoLng: 38.23 }],
    ["latitude out of range", { geoLat: 91, geoLng: 38.23 }],
    ["longitude out of range", { geoLat: -1.45, geoLng: 181 }],
  ])("drops both coordinates given %s", async (_label, coords) => {
    fetchMock.mockResolvedValue(detailResponse({ ...DETAIL_ROW, ...coords }));

    const voucher = await getMarketVoucher(DETAIL_ROW.address);

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

    await expect(getMarketVoucher(DETAIL_ROW.address)).rejects.toThrow();
  });

  // An unrecognised kind only picks a marker glyph, so unlike a catalog row it
  // must not discard an otherwise readable voucher.
  it("falls back to the voucher kind rather than failing", async () => {
    fetchMock.mockResolvedValue(detailResponse({ ...DETAIL_ROW, kind: "eatery" }));

    expect((await getMarketVoucher(DETAIL_ROW.address)).kind).toBe("voucher");
  });

  // The address arrives from a route param, so a hostile value must stay inside
  // its path segment: no extra segment, no query string of its own.
  it("keeps the address inside one path segment", async () => {
    fetchMock.mockResolvedValue(detailResponse(DETAIL_ROW));

    await getMarketVoucher("../vouchers?perPage=1");

    const url = new URL(requestedUrl());
    expect(url.pathname).toBe("/api/v2/vouchers/..%2Fvouchers%3FperPage%3D1");
    expect(url.search).toBe("");
  });

  it("sends no credentials, so a shared cache stays usable", async () => {
    fetchMock.mockResolvedValue(detailResponse(DETAIL_ROW));

    await getMarketVoucher(DETAIL_ROW.address);

    expect(requestedInit().credentials).toBe("omit");
    expect(requestedInit().cache).toBeUndefined();
  });
});
