import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createOfferingsClient } from "./client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createOfferingsClient(createHttpClient({ baseUrl: "https://api.test" }));

const fetchMock = vi.fn();
const VOUCHER_ADDRESS = "0x4444444444444444444444444444444444444444";
const SELLER_ADDRESS = "0x6666666666666666666666666666666666666666";

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    voucherId: 10,
    voucherAddress: VOUCHER_ADDRESS,
    voucherUoa: "KES",
    priceInUnitOfAccount: "21.0000",
    sellerAddress: SELLER_ADDRESS,
    commodityName: "Vegetables",
    commodityType: "GOOD",
    description: "Fresh produce",
    quantity: "5.0000",
    frequency: "week",
    price: "10.5000",
    imageUrl: "https://content.example/vegetables.jpg",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getVoucherOfferings", () => {
  it("builds first and next cursor requests with the public cache policy", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [], first: 0, last: 0 }));
    const controller = new AbortController();

    await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 }, controller.signal);
    await api.getVoucherOfferings(
      VOUCHER_ADDRESS,
      { perPage: 20, cursor: 9, next: true },
      controller.signal,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings?perPage=20`),
      expect.objectContaining({
        credentials: "omit",
        method: "GET",
        signal: controller.signal,
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("cursor=");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings?perPage=20&cursor=9&next=true`,
      ),
      expect.objectContaining({ credentials: "omit", method: "GET" }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("cache");
  });

  it("normalizes valid rows while preserving addresses and numeric text", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [offering()], first: 3, last: 3 }));

    const page = await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 });

    expect(page).toMatchObject({
      first: 3,
      last: 3,
      receivedCount: 1,
      offerings: [
        {
          voucherAddress: VOUCHER_ADDRESS,
          sellerAddress: SELLER_ADDRESS,
          quantity: "5.0000",
          pricePerUnit: "10.5000",
          voucherUoa: "KES",
          priceInUnitOfAccount: "21.0000",
          frequency: "week",
        },
      ],
    });
  });

  it("rejects unsafe images and counts malformed rows before dropping them", async () => {
    fetchMock.mockResolvedValue(
      response({
        offerings: [
          offering({ imageUrl: "javascript:alert(1)" }),
          offering({ id: 2, sellerAddress: undefined }),
        ],
        first: 3,
        last: 2,
      }),
    );

    const page = await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 });

    expect(page.receivedCount).toBe(2);
    expect(page.offerings).toHaveLength(1);
    expect(page.offerings[0]?.imageUrl).toBeNull();
  });

  it("normalizes missing cursors to zero", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [] }));

    const page = await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 });

    expect(page.first).toBe(0);
    expect(page.last).toBe(0);
  });
});

describe("getOfferings discovery", () => {
  it("serializes search, tags, nearby scope, facets, cursor, and verified pools", async () => {
    fetchMock.mockResolvedValue(
      response({
        offerings: [
          offering({
            voucherName: "Community voucher",
            voucherSymbol: "CV",
            voucherImageUrl: "https://content.example/voucher.jpg",
            voucherLocationName: "Kilifi",
            voucherGeoLat: -3.63,
            voucherGeoLng: 39.85,
            effectiveLocationName: "Mombasa",
            effectiveGeoLat: -4.05,
            effectiveGeoLng: 39.67,
            distanceMeters: 12_345,
            tags: ["food"],
          }),
        ],
        nextCursor: "opaque+/=",
        tagFacets: [
          { tag: "food", count: 2 },
          { tag: "", count: -1 },
        ],
      }),
    );
    const controller = new AbortController();

    const page = await api.getOfferings(
      {
        perPage: 20,
        cursor: "cursor+/=",
        q: "  maize flour  ",
        tags: ["food", "local"],
        tagMatch: "all",
        facets: true,
        nearby: true,
        pools: [{ chainId: 100, address: VOUCHER_ADDRESS.toUpperCase() }],
      },
      controller.signal,
    );

    const [rawUrl, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(rawUrl));
    expect(url.pathname).toBe("/api/v2/offerings");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      perPage: "20",
      cursor: "cursor+/=",
      q: "maize flour",
      tags: "food,local",
      tagMatch: "all",
      facets: "true",
      nearby: "true",
      pools: `100:${VOUCHER_ADDRESS}`,
    });
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    expect(page).toMatchObject({
      nextCursor: "opaque+/=",
      receivedCount: 1,
      tagFacets: [{ tag: "food", count: 2 }],
      offerings: [
        {
          voucherName: "Community voucher",
          voucherSymbol: "CV",
          voucherImageUrl: "https://content.example/voucher.jpg",
          effectiveLocationName: "Mombasa",
          effectiveGeoLat: -4.05,
          effectiveGeoLng: 39.67,
          distanceMeters: 12_345,
          tags: ["food"],
        },
      ],
    });
  });

  it("keeps global discovery public and omits empty filters", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [], nextCursor: null }));

    await api.getOfferings({ q: " ", tags: [], tagMatch: "all", pools: [] });

    const [rawUrl, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(rawUrl));
    expect(url.searchParams.get("perPage")).toBe("20");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("tags")).toBe(false);
    expect(url.searchParams.has("tagMatch")).toBe(false);
    expect(url.searchParams.has("pools")).toBe(false);
    expect(init).toMatchObject({ method: "GET", credentials: "omit" });
    expect(init).not.toHaveProperty("cache");
  });
});

describe("offerings HTTP cache policy", () => {
  const fresh = createOfferingsClient(createHttpClient({ baseUrl: "https://api.test" }), {
    cache: "no-store",
  });

  function initOf(call = 0): RequestInit {
    return (fetchMock.mock.calls[call]?.[1] ?? {}) as RequestInit;
  }

  // The voucher-offerings route answers `Cache-Control: public, max-age=60,
  // stale-while-revalidate=300`, so a console reading it beside a no-store
  // voucher record would show a fresh voucher next to offerings up to six minutes
  // old. jsdom has no HTTP cache, so the request's `cache` is the only thing that
  // can be asserted.
  it("sends no-store on the public voucher route when asked", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [], first: 0, last: 0 }));
    await fresh.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 10 });
    expect(initOf().cache).toBe("no-store");
  });

  it("leaves the cache to the platform by default", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [], first: 0, last: 0 }));
    await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 10 });
    expect("cache" in initOf()).toBe(false);
  });

  // The pool route is public and already no-store; the option must not
  // change what it sends.
  it("leaves the public pool route on its own no-store", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [], first: 0, last: 0 }));
    await api.getPoolOfferings(VOUCHER_ADDRESS, { perPage: 10 });
    expect(initOf()).toMatchObject({ cache: "no-store", credentials: "omit" });
  });
});

describe("the app-facing model", () => {
  it("renames the backend's import vocabulary once, here", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [offering()], first: 3, last: 3 }));

    const [row] = (await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 })).offerings;

    expect(row).toMatchObject({
      name: "Vegetables",
      pricePerUnit: "10.5000",
      commodityType: "GOOD",
    });
    // The old names are gone from the app model. Anything still reading them is
    // reading the wire directly, which is the thing this layer exists to prevent.
    expect(row).not.toHaveProperty("commodityName");
    expect(row).not.toHaveProperty("price");
  });

  // Every nonblank stored unit is now displayable and resubmittable; the backend
  // resolves built-ins case-insensitively and creates custom values on write.
  it("keeps built-in and custom unit text editable", async () => {
    fetchMock.mockResolvedValue(
      response({
        offerings: [
          offering({ id: 1, unit: "kg" }),
          offering({ id: 2, unit: "50kg sack" }),
          offering({ id: 3, unit: "  litre  " }),
          offering({ id: 4, unit: "KG" }),
          offering({ id: 5, unit: null }),
          offering({ id: 6, unit: "   " }),
        ],
        first: 1,
        last: 6,
      }),
    );

    const rows = (await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 })).offerings;

    expect(rows.map((row) => [row.unit, row.unitLabel])).toEqual([
      ["kg", "kg"],
      ["50kg sack", "50kg sack"],
      ["litre", "litre"],
      ["KG", "KG"],
      [null, null],
      [null, null],
    ]);
  });

  // An imported row with no usable classification is readable and not writable,
  // the same way an unknown unit is.
  it("nulls a commodity type outside the two the database allows", async () => {
    fetchMock.mockResolvedValue(
      response({
        offerings: [
          offering({ id: 1, commodityType: "SERVICE" }),
          offering({ id: 2, commodityType: "UNCLASSIFIED" }),
          offering({ id: 3, commodityType: "good" }),
          offering({ id: 4, commodityType: null }),
        ],
        first: 1,
        last: 4,
      }),
    );

    const rows = (await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 })).offerings;
    expect(rows.map((row) => row.commodityType)).toEqual(["SERVICE", null, null, null]);
  });

  // The reason the price is a string end to end. Each of these is a value that
  // does not survive a round trip through Number.
  it.each(["120.50", "0.000000000000000001", "9007199254740993", "12345678901234567890.12345"])(
    "carries %s through unchanged",
    async (price) => {
      fetchMock.mockResolvedValue(
        response({ offerings: [offering({ price })], first: 1, last: 1 }),
      );

      const [row] = (await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 })).offerings;
      expect(row?.pricePerUnit).toBe(price);
    },
  );
});

describe("the managed read override", () => {
  it("sets no cache by default and no-store when asked", async () => {
    fetchMock.mockResolvedValue(response({ offerings: [], first: 0, last: 0 }));

    await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("cache");

    await api.getVoucherOfferings(VOUCHER_ADDRESS, { perPage: 20 }, undefined, {
      cache: "no-store",
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ cache: "no-store" });
    // Still the public endpoint and still cookie-free: only the browser cache
    // policy differs, so a guest and an owner read the same representation.
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ credentials: "omit" });
  });

  it("applies to the item read as well", async () => {
    fetchMock.mockResolvedValue(response({ offering: offering() }));

    await api.getVoucherOffering(VOUCHER_ADDRESS, "3", undefined, { cache: "no-store" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      method: "GET",
    });
  });
});

describe("the write methods", () => {
  const input = {
    name: "Fresh maize flour",
    commodityType: "GOOD" as const,
    description: "Stone-ground flour packed on collection day.",
    unit: "kg" as const,
    pricePerUnit: "120.50",
    imageUrl: "https://content.example/offering/a_800_b.webp",
  };

  it("posts to the nested route in the backend's vocabulary", async () => {
    fetchMock.mockResolvedValue(response({ offering: offering() }));

    await api.createVoucherOffering(VOUCHER_ADDRESS, input);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://api.test/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings`);
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    // The rename happens here and nowhere else.
    expect(JSON.parse(init.body as string)).toEqual({
      commodityName: "Fresh maize flour",
      commodityType: "GOOD",
      description: "Stone-ground flour packed on collection day.",
      unit: "kg",
      price: "120.50",
      imageUrl: "https://content.example/offering/a_800_b.webp",
    });
    // Cookies, never the storage bearer token: only the upload talks to storage.
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  // TanStack Form validates against the schema but submits the caller's own
  // values, so trimming has to happen on the way out or a padded name travels.
  it("normalizes the text it sends, not just the text it validated", async () => {
    fetchMock.mockResolvedValue(response({ offering: offering() }));

    await api.createVoucherOffering(VOUCHER_ADDRESS, {
      ...input,
      name: "  Fresh maize flour  ",
      description: "  Stone-ground.  ",
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
    expect(body.commodityName).toBe("Fresh maize flour");
    expect(body.description).toBe("Stone-ground.");
  });

  // The same guard the form has, at the boundary that actually reaches the
  // network: a caller that skipped validation cannot send an invalid write.
  it("refuses a write the schema rejects", async () => {
    fetchMock.mockResolvedValue(response({ offering: offering() }));

    await expect(
      api.createVoucherOffering(VOUCHER_ADDRESS, { ...input, pricePerUnit: "0" }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts to the item route and returns the saved row", async () => {
    fetchMock.mockResolvedValue(response({ offering: offering({ commodityName: "Renamed" }) }));

    const saved = await api.updateVoucherOffering(VOUCHER_ADDRESS, "3", input);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://api.test/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings/3`);
    expect(init).toMatchObject({ method: "PUT", cache: "no-store" });
    // The response is the source of truth for what was stored, not the input.
    expect(saved.name).toBe("Renamed");
  });

  // An explicit null, not an omitted key: PUT is assign-all, so the two would
  // otherwise be indistinguishable to the server.
  it("sends a cleared photo as null rather than omitting it", async () => {
    fetchMock.mockResolvedValue(response({ offering: offering({ imageUrl: null }) }));

    await api.updateVoucherOffering(VOUCHER_ADDRESS, "3", { ...input, imageUrl: null });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
    expect(body).toHaveProperty("imageUrl", null);
  });

  it("deletes the item route and returns the id the server unlisted", async () => {
    fetchMock.mockResolvedValue(response({ id: 3 }));

    const id = await api.deleteVoucherOffering(VOUCHER_ADDRESS, "3");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://api.test/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings/3`);
    expect(init).toMatchObject({ method: "DELETE", cache: "no-store" });
    // A numeric id on the wire, a string in the app: the same normalization the
    // read path applies, so a cache key built from either matches.
    expect(id).toBe("3");
  });

  it("treats a 2xx with no usable offering as a protocol failure", async () => {
    fetchMock.mockResolvedValue(response({ offering: null }));

    await expect(api.createVoucherOffering(VOUCHER_ADDRESS, input)).rejects.toThrow(
      /no usable offering/,
    );
  });
});
