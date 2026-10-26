import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createPoolsClient } from "./client";

import type { VoucherRef } from "@clc/core/features/catalog/logic";

import { normalizeUserPool } from "./client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createPoolsClient(createHttpClient({ baseUrl: "https://api.test" }));

function mockFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pools client", () => {
  it("uses the protected composition route for admin clients", async () => {
    const fetcher = mockFetch({ ok: true, result: { vouchers: [], total: 3 } });
    vi.stubGlobal("fetch", fetcher);
    const admin = createPoolsClient(createHttpClient({ baseUrl: "https://api.test" }), {
      adminComposition: true,
    });
    const page = await admin.getPoolVouchers("0x123", { perPage: 20 });
    expect(page.total).toBe(3);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/admin/pools/0x123/vouchers?perPage=20"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fetches global pools with first-page pagination", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: { pools: [], first: undefined, last: undefined },
    });
    vi.stubGlobal("fetch", fetcher);

    await api.getPools({ perPage: 20 });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/pools?perPage=20"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches global pools with next cursor pagination", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [], first: 1, last: 5 } });
    vi.stubGlobal("fetch", fetcher);

    await api.getPools({ perPage: 20, cursor: 5, next: true });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/pools?perPage=20&cursor=5&next=true"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches a pool by address for detail routes", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        pool: {
          id: 7,
          address: "0x1111111111111111111111111111111111111111",
          name: "Fresh Food Circle",
          symbol: "FFC",
          description: "Local food vouchers",
          tags: ["Food"],
        },
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const pool = await api.getPoolByAddress("0x1111111111111111111111111111111111111111");

    expect(pool.name).toBe("Fresh Food Circle");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/pools/0x1111111111111111111111111111111111111111"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("strips legacy contacts publicly and loads them only from authenticated info", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    const row = {
      id: 7,
      address,
      name: "Fresh Food Circle",
      symbol: "FFC",
      email: "pool@example.test",
      phone: "+254700000000",
      website: "https://pool.example.test",
    };
    const fetcher = mockFetch({ ok: true, result: { pool: row } });
    vi.stubGlobal("fetch", fetcher);

    await expect(api.getPoolByAddress(address)).resolves.toMatchObject({
      email: null,
      phone: null,
      website: null,
    });
    expect((fetcher.mock.calls[0] as [string, RequestInit])[1].credentials).toBe("include");

    const controller = new AbortController();
    await expect(api.getPoolInfo(address, controller.signal)).resolves.toMatchObject({
      email: "pool@example.test",
      phone: "+254700000000",
      website: "https://pool.example.test",
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe(`https://api.test/api/v2/pools/${address}/info`);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    });
  });

  it("normalizes null pools and trims metadata safely", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: null } });
    vi.stubGlobal("fetch", fetcher);

    await expect(api.getPools({ perPage: 20 })).resolves.toEqual({ pools: [], receivedCount: 0 });

    const pool = normalizeUserPool({
      id: "8",
      address: "0x2222222222222222222222222222222222222222",
      name: "  Garden Pool  ",
      symbol: " GRDN ",
      description: null,
      tags: [" Food ", "", "Growing"],
      tokenRegistryAddress: "not-an-address",
    });

    expect(pool?.name).toBe("Garden Pool");
    expect(pool?.symbol).toBe("GRDN");
    expect(pool?.description).toBe("Garden Pool community liquidity pool");
    expect(pool?.tags).toEqual(["Food", "Growing"]);
    expect(pool?.tokenRegistryAddress).toBeNull();
  });

  it("filters invalid pool addresses instead of fabricating route identity", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        pools: [
          { id: 1, address: "not-an-address", name: "Broken Pool", symbol: "BAD" },
          {
            id: 2,
            address: "0x3333333333333333333333333333333333333333",
            name: "Valid Pool",
            symbol: "GOOD",
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const page = await api.getPools({ perPage: 20 });

    expect(page.pools).toHaveLength(1);
    expect(page.pools[0]?.name).toBe("Valid Pool");
    expect(normalizeUserPool({ address: "nope" })).toBeNull();
  });

  it("strips contacts from legacy public pool-list rows", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        pools: [
          {
            id: 2,
            address: "0x3333333333333333333333333333333333333333",
            name: "Valid Pool",
            symbol: "GOOD",
            email: "pool@example.test",
            phone: "+254700000000",
            website: "https://pool.example.test",
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(api.getPools({ perPage: 20 })).resolves.toMatchObject({
      pools: [{ email: null, phone: null, website: null }],
    });
  });

  it("fetches real pool vouchers with oracle and offering metadata", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        first: 10,
        last: 9,
        vouchers: [
          {
            id: 10,
            address: "0x4444444444444444444444444444444444444444",
            name: "Market Credit",
            symbol: "MKT",
            decimals: 6,
            description: "Accepted by market sellers",
            iconUrl: "https://example.com/mkt.png",
            offerCount: 7,
            availableOfferCount: 5,
            tokenLimit: "1000000000",
            oracleFeedId: 11,
            oracleName: "KES",
            oracleAddress: "0x5555555555555555555555555555555555555555",
            email: "issuer@example.test",
            phone: "+254700000000",
            website: "https://voucher.example.test",
            tags: ["Market"],
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const page = await api.getPoolVouchers("0x1111111111111111111111111111111111111111", {
      perPage: 20,
      cursor: 11,
      next: true,
    });

    expect(page.vouchers[0]).toMatchObject({
      tokenAddress: "0x4444444444444444444444444444444444444444",
      offerCount: 7,
      availableOfferCount: 5,
      oracleName: "KES",
    });
    expect(page.vouchers[0]).not.toHaveProperty("email");
    expect(page.vouchers[0]).not.toHaveProperty("phone");
    expect(page.vouchers[0]).not.toHaveProperty("website");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v2/pools/0x1111111111111111111111111111111111111111/vouchers?perPage=20&cursor=11&next=true",
      ),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });
});

describe("updatePoolProfile", () => {
  const ADDRESS = "0xAbC0000000000000000000000000000000000123";
  const base = {
    description: "A pool",
    unitOfAccount: "KES",
    email: "  ",
    website: "",
    phone: " +254700000000 ",
    terms: "",
    locationName: "Kilifi",
    geoLat: -3.5,
    geoLng: 39.9,
    tags: ["food"],
  };

  it("PUTs the whole record to the owner route and returns the saved row", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        pool: {
          address: ADDRESS,
          name: "Kilifi Traders",
          contractName: "Kilifi Pool",
          symbol: "KLF",
        },
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const pool = await api.updatePoolProfile(ADDRESS, base);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.test/api/v2/pools/${ADDRESS}/profile`);
    expect(init.method).toBe("PUT");
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      description: "A pool",
      unitOfAccount: "KES",
      email: null,
      website: null,
      phone: "+254700000000",
      terms: null,
      locationName: "Kilifi",
      geoLat: -3.5,
      geoLng: 39.9,
      tags: ["food"],
    });
    expect(pool.name).toBe("Kilifi Traders");
    expect(pool.contractName).toBe("Kilifi Pool");
  });

  // The label is an override, and an ordinary metadata save must not create one.
  it("sends the display name only when the caller supplied it, and passes a blank through", async () => {
    const fetcher = mockFetch({ ok: true, result: { pool: { address: ADDRESS } } });
    vi.stubGlobal("fetch", fetcher);

    await api.updatePoolProfile(ADDRESS, base);
    let body = JSON.parse((fetcher.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect("displayName" in body).toBe(false);

    await api.updatePoolProfile(ADDRESS, { ...base, displayName: "Kilifi Traders" });
    body = JSON.parse((fetcher.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.displayName).toBe("Kilifi Traders");

    await api.updatePoolProfile(ADDRESS, { ...base, displayName: "" });
    body = JSON.parse((fetcher.mock.calls[2] as [string, RequestInit])[1].body as string);
    expect(body.displayName).toBe("");
  });

  it("rejects a response without a usable pool", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, result: { pool: { name: "No address" } } }));
    await expect(api.updatePoolProfile(ADDRESS, base)).rejects.toThrow(
      "Pool update response did not include a valid address.",
    );
  });

  it("sends explicit contact-clearing intent only when supplied", async () => {
    const fetcher = mockFetch({ ok: true, result: { pool: { address: ADDRESS } } });
    vi.stubGlobal("fetch", fetcher);

    await api.updatePoolProfile(ADDRESS, base);
    let body = JSON.parse((fetcher.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty("clearContactFields");

    await api.updatePoolProfile(ADDRESS, {
      ...base,
      clearContactFields: ["phone", "website"],
    });
    body = JSON.parse((fetcher.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.clearContactFields).toEqual(["phone", "website"]);
  });
});

describe("getPools pagination and cancellation", () => {
  it("reports the sent row count, not the surviving one", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: {
        pools: [
          { id: 1, address: "0x6666666666666666666666666666666666666666", name: "Kept" },
          { id: 2, address: "not-an-address", name: "Dropped" },
        ],
        first: 2,
        last: 1,
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const page = await api.getPools({ perPage: 20 });

    expect(page.pools).toHaveLength(1);
    expect(page.receivedCount).toBe(2);
  });

  it("forwards an abort signal", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [] } });
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();

    await api.getPools({ perPage: 20 }, controller.signal);

    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal, cache: "no-store" }),
    );
  });
});

describe("getFilteredPools request", () => {
  const FILTER = {
    term: "",
    tags: [] as readonly string[],
    tagMatch: "any" as const,
    vouchers: [] as const,
    voucherMatch: "any" as const,
  };

  it("encodes a term and comma-joins tags in one key", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [] } });
    vi.stubGlobal("fetch", fetcher);

    await api.getFilteredPools({
      perPage: 100,
      filter: { ...FILTER, term: "fresh food", tags: ["Food", "Common Spaces"] },
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("fresh food");
    expect(url.searchParams.get("tags")).toBe("Food,Common Spaces");
    expect(url.searchParams.getAll("tags")).toHaveLength(1);
    expect(url.searchParams.get("perPage")).toBe("100");
  });

  it("omits every filter key it has nothing to say about", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [] } });
    vi.stubGlobal("fetch", fetcher);

    await api.getFilteredPools({ perPage: 100, filter: FILTER });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    for (const key of ["q", "tags", "tagMatch", "vouchers", "voucherMatch", "facets"]) {
      expect(url.searchParams.has(key)).toBe(false);
    }
  });

  it("sends tagMatch only when two or more tags make the modes differ", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [] } });
    vi.stubGlobal("fetch", fetcher);

    await api.getFilteredPools({
      perPage: 100,
      filter: { ...FILTER, tags: ["Food"], tagMatch: "all" },
    });
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.has("tagMatch")).toBe(false);

    await api.getFilteredPools({
      perPage: 100,
      filter: { ...FILTER, tags: ["Food", "Growing"], tagMatch: "all" },
    });
    expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.get("tagMatch")).toBe("all");
  });

  it("encodes stable voucher identities and sends all-match only when it changes semantics", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [] } });
    vi.stubGlobal("fetch", fetcher);
    const first: VoucherRef = {
      chainId: 1,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const second: VoucherRef = {
      chainId: 42220,
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    await api.getFilteredPools({
      perPage: 100,
      filter: { ...FILTER, vouchers: [first], voucherMatch: "all" },
    });
    const one = new URL(String(fetcher.mock.calls[0]?.[0])).searchParams;
    expect(one.get("vouchers")).toBe("1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(one.has("voucherMatch")).toBe(false);

    await api.getFilteredPools({
      perPage: 100,
      filter: { ...FILTER, vouchers: [first, second], voucherMatch: "all" },
    });
    const two = new URL(String(fetcher.mock.calls[1]?.[0])).searchParams;
    expect(two.get("vouchers")).toBe(
      "1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,42220:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(two.get("voucherMatch")).toBe("all");
  });

  it("keeps the authenticated pool read policy, unlike the public catalog", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [] } });
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();

    await api.getFilteredPools({ perPage: 100, filter: FILTER, facets: true }, controller.signal);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("facets=true"),
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      }),
    );
  });

  it("normalizes the pool tag facet and distinguishes absent from empty", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        ok: true,
        result: {
          pools: [],
          tagFacets: [
            { tag: "Food", count: 2 },
            { tag: "Growing", count: 0 },
            { tag: "", count: 1 },
            { tag: "Negative", count: -1 },
          ],
        },
      }),
    );

    const page = await api.getFilteredPools({ perPage: 100, filter: FILTER });

    expect(page.tagFacets).toEqual([
      { tag: "Food", count: 2 },
      { tag: "Growing", count: 0 },
    ]);

    vi.stubGlobal("fetch", mockFetch({ ok: true, result: { pools: [] } }));
    expect((await api.getFilteredPools({ perPage: 100, filter: FILTER })).tagFacets).toBeNull();
  });

  it("normalizes voucher facets and drops malformed rows", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        ok: true,
        result: {
          pools: [],
          voucherFacets: [
            {
              chainId: 42220,
              address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              name: "Sarafu",
              symbol: "SRF",
              count: 3,
            },
            { id: 18, chainId: 42220, address: "bad", name: "Bad", symbol: "BAD", count: 1 },
            {
              chainId: Number.MAX_SAFE_INTEGER + 1,
              address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              name: "Unsafe",
              symbol: "BAD",
              count: 1,
            },
          ],
        },
      }),
    );

    const page = await api.getFilteredPools({ perPage: 100, filter: FILTER });
    expect(page.voucherFacets).toEqual([
      {
        chainId: 42220,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Sarafu",
        symbol: "SRF",
        count: 3,
      },
    ]);
  });

  it("reports the sent row count so a filtered walk cannot truncate", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        ok: true,
        result: {
          pools: [
            { id: 1, address: "0x7777777777777777777777777777777777777777", name: "Kept" },
            { id: 2, address: "bad", name: "Dropped" },
          ],
          first: 2,
          last: 1,
        },
      }),
    );

    const page = await api.getFilteredPools({ perPage: 100, filter: FILTER });

    expect(page.pools).toHaveLength(1);
    expect(page.receivedCount).toBe(2);
  });
});

describe("pool quoter type", () => {
  it("keeps the three quoter kinds and reports anything else as unknown", async () => {
    // The value decides which setter an operator signs, so a kind no call builder
    // handles must not reach that decision as if it were understood.
    const pool = (quoterType: unknown) =>
      normalizeUserPool({
        address: "0xdD97a5282D11e55d7271d466C80963d6793B276f",
        quoterType,
      } as never);

    expect(pool("oracle")?.quoterType).toBe("oracle");
    expect(pool("relative")?.quoterType).toBe("relative");
    expect(pool("decimal")?.quoterType).toBe("decimal");
    expect(pool("chainlink")?.quoterType).toBeNull();
    expect(pool(null)?.quoterType).toBeNull();
    expect(pool(undefined)?.quoterType).toBeNull();
  });
});
