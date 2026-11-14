import { describe, expect, it, vi } from "vite-plus/test";

import type { MarketplaceClient, MarketplaceParams } from "./client";
import { marketplaceInfiniteQueryOptions, marketplaceKeys } from "./queries";
import { BackendApiError } from "../../client/errors";

describe("marketplace cache", () => {
  it("canonicalizes query identity and verified pool references", () => {
    const params: Omit<MarketplaceParams, "cursor"> & { scope?: string } = {
      scope: "nearby:account:100:1:2:500",
      q: "  repair  ",
      kinds: ["offering", "voucher"] as const,
      tags: ["Repair"],
      pools: [{ chainId: 100, address: `0x${"A".repeat(40)}` }],
      postTiming: "future" as const,
      postVouchers: [{ chainId: 100, address: `0x${"B".repeat(40)}` }],
      postPools: [{ chainId: 100, address: `0x${"C".repeat(40)}` }],
    };

    expect(marketplaceKeys.list(params)).toEqual([
      "clc",
      "marketplace",
      "list",
      {
        ...params,
        q: "repair",
        kinds: ["offering", "voucher"],
        tags: ["Repair"],
        pools: [`100:0x${"a".repeat(40)}`],
        credit: null,
        postTiming: "future",
        postVouchers: [`100:0x${"b".repeat(40)}`],
        postPools: [`100:0x${"c".repeat(40)}`],
      },
    ]);
    expect(marketplaceKeys.list({})).toEqual([
      "clc",
      "marketplace",
      "list",
      {
        q: "",
        kinds: [],
        tags: [],
        pools: undefined,
        credit: null,
        postVouchers: undefined,
        postPools: undefined,
      },
    ]);
  });

  it("never shares a creditDepth page across wallets, depths or reach digests", () => {
    const alice = { depth: 2 as const, wallet: `0x${"A1".repeat(20)}`, digest: "0xAB" };
    const key = marketplaceKeys.list({ credit: alice });
    expect(key[3].credit).toEqual({ depth: 2, wallet: alice.wallet.toLowerCase(), digest: "0xab" });
    expect(
      marketplaceKeys.list({ credit: { ...alice, wallet: `0x${"b2".repeat(20)}` } }),
    ).not.toEqual(key);
    expect(marketplaceKeys.list({ credit: { ...alice, depth: 1 } })).not.toEqual(key);
    expect(marketplaceKeys.list({ credit: { ...alice, digest: "0xcd" } })).not.toEqual(key);
    expect(marketplaceKeys.list({})).not.toEqual(key);
  });

  it("keeps scope in the key, strips it from requests and preserves opaque cursors", async () => {
    const list = vi.fn().mockResolvedValue({ results: [], nextCursor: null });
    const client = { list } as unknown as MarketplaceClient;
    const params = {
      scope: "nearby:account:100:1:2:500",
      q: "repair",
      nearby: true,
      facets: true,
    };
    const options = marketplaceInfiniteQueryOptions(client, params);
    const signal = new AbortController().signal;

    await options.queryFn?.({ pageParam: "opaque+/=", signal } as never);
    expect(options.queryKey).toEqual(marketplaceKeys.list(params));
    expect(list).toHaveBeenCalledWith(
      { q: "repair", nearby: true, facets: true, cursor: "opaque+/=" },
      signal,
    );
    expect(options.getNextPageParam?.({ results: [], nextCursor: "next" }, [], undefined, [])).toBe(
      "next",
    );
    expect(
      options.getNextPageParam?.({ results: [], nextCursor: null }, [], undefined, []),
    ).toBeUndefined();
  });

  it("recovers Marketplace reads from rate limits and temporary capacity failures", () => {
    const options = marketplaceInfiniteQueryOptions(
      { list: vi.fn() } as unknown as MarketplaceClient,
      {},
    );
    const retry = options.retry as (count: number, error: unknown) => boolean;

    expect(retry(0, new BackendApiError(429, "slow", undefined, { retryAfterMs: 1_000 }))).toBe(
      true,
    );
    expect(retry(2, new BackendApiError(503, "busy"))).toBe(true);
    expect(retry(3, new BackendApiError(503, "busy"))).toBe(false);
    expect(retry(0, new BackendApiError(400, "invalid"))).toBe(false);
  });
});
