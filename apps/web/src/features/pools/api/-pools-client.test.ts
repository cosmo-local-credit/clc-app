import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getUserPoolByAddress, getUserPools, normalizeUserPool } from "./pools-client";

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
  it("fetches user pools with documented first-page pagination", async () => {
    const fetcher = mockFetch({
      ok: true,
      result: { pools: [], first: undefined, last: undefined },
    });
    vi.stubGlobal("fetch", fetcher);

    await getUserPools({ perPage: 100 });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/users/me/pools?perPage=100"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches user pools with documented next cursor pagination", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: [], first: 1, last: 5 } });
    vi.stubGlobal("fetch", fetcher);

    await getUserPools({ perPage: 100, cursor: 5, next: true });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/users/me/pools?perPage=100&cursor=5&next=true"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("fetches a pool by address for direct detail routes", async () => {
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

    const pool = await getUserPoolByAddress("0x1111111111111111111111111111111111111111");

    expect(pool.name).toBe("Fresh Food Circle");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/users/me/pools/0x1111111111111111111111111111111111111111"),
      expect.objectContaining({ credentials: "include", method: "GET", cache: "no-store" }),
    );
  });

  it("normalizes null pools and trims metadata safely", async () => {
    const fetcher = mockFetch({ ok: true, result: { pools: null } });
    vi.stubGlobal("fetch", fetcher);

    await expect(getUserPools({ perPage: 100 })).resolves.toEqual({ pools: [] });

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

    const page = await getUserPools({ perPage: 100 });

    expect(page.pools).toHaveLength(1);
    expect(page.pools[0]?.name).toBe("Valid Pool");
    expect(normalizeUserPool({ address: "nope" })).toBeNull();
  });
});
