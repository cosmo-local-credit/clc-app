import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getPoolByAddress, getPools, getPoolVouchers, normalizeUserPool } from "./pools-client";

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
  it("fetches global pools with first-page pagination", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: { pools: [], first: undefined, last: undefined },
    });
    vi.stubGlobal("fetch", fetcher);

    await getPools({ perPage: 20 });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/pools?perPage=20"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches global pools with next cursor pagination", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [], first: 1, last: 5 } });
    vi.stubGlobal("fetch", fetcher);

    await getPools({ perPage: 20, cursor: 5, next: true });

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

    const pool = await getPoolByAddress("0x1111111111111111111111111111111111111111");

    expect(pool.name).toBe("Fresh Food Circle");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/pools/0x1111111111111111111111111111111111111111"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("normalizes null pools and trims metadata safely", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: null } });
    vi.stubGlobal("fetch", fetcher);

    await expect(getPools({ perPage: 20 })).resolves.toEqual({ pools: [] });

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

    const page = await getPools({ perPage: 20 });

    expect(page.pools).toHaveLength(1);
    expect(page.pools[0]?.name).toBe("Valid Pool");
    expect(normalizeUserPool({ address: "nope" })).toBeNull();
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
            tags: ["Market"],
          },
        ],
      },
    });
    vi.stubGlobal("fetch", fetcher);

    const page = await getPoolVouchers("0x1111111111111111111111111111111111111111", {
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
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v2/pools/0x1111111111111111111111111111111111111111/vouchers?perPage=20&cursor=11&next=true",
      ),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });
});
