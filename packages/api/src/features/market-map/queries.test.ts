import { describe, expect, it, vi } from "vite-plus/test";
import { BackendApiError } from "../../client/errors";
import type { MarketMapClient, MarketMapParams } from "./client";
import {
  discoveryRetryDelayMs,
  isRetryableDiscoveryError,
  marketMapFacetsQueryOptions,
  marketMapKeys,
  marketMapPointsQueryOptions,
} from "./queries";

const params: MarketMapParams = {
  kinds: ["voucher", "want"],
  filter: { term: "market", tags: ["Food"], tagMatch: "any" },
  creditablePools: [{ chainId: 100, address: `0x${"A".repeat(40)}` }],
};

const ALICE = { wallet: `0x${"A1".repeat(20)}`, digest: `0x${"0F".repeat(32)}` };

describe("market map Credit scope", () => {
  it("keys a Credit response on the wallet and the reach digest", () => {
    const credit = { kinds: params.kinds, filter: params.filter, credit: ALICE };
    const bob = { ...credit, credit: { ...ALICE, wallet: `0x${"b2".repeat(20)}` } };
    const moved = { ...credit, credit: { ...ALICE, digest: `0x${"1e".repeat(32)}` } };
    const key = marketMapKeys.points(credit);
    expect(key[3].credit).toEqual({
      wallet: ALICE.wallet.toLowerCase(),
      digest: ALICE.digest.toLowerCase(),
    });
    for (const other of [bob, moved]) {
      expect(marketMapKeys.points(other)).not.toEqual(key);
    }
    expect(
      marketMapKeys.points({ ...credit, credit: { ...ALICE, wallet: ALICE.wallet.toLowerCase() } }),
    ).toEqual(key);
    expect(marketMapKeys.points({ kinds: params.kinds, filter: params.filter })).not.toEqual(key);
    expect(marketMapKeys.facets({ ...credit, bounds: [] })[3].credit).toEqual(key[3].credit);
  });
});

describe("market map points query", () => {
  it("is keyed by filters, kinds and canonical pool addresses only", () => {
    expect(marketMapKeys.points(params)).toEqual([
      "clc",
      "market-map",
      "points",
      {
        kinds: ["voucher", "want"],
        filter: { term: "market", tags: ["Food"], tagMatch: "any" },
        creditablePools: [`100:0x${"a".repeat(40)}`],
        credit: null,
        postTiming: "future",
        postVouchers: undefined,
        postVoucherMatch: "any",
        postPools: undefined,
        postPoolMatch: "any",
      },
    ]);
  });

  it("does not vary with the viewport", () => {
    const withViewport = {
      ...params,
      bounds: [{ minLng: 35, minLat: -5, maxLng: 41, maxLat: 1 }],
      zoom: 8,
    } as MarketMapParams;
    expect(marketMapKeys.points(withViewport)).toEqual(marketMapKeys.points(params));
  });

  it("sits under the market map root for invalidation", () => {
    expect(marketMapKeys.points(params).slice(0, 2)).toEqual([...marketMapKeys.all]);
    expect(marketMapKeys.facets({ ...params, bounds: [] }).slice(0, 2)).toEqual([
      ...marketMapKeys.all,
    ]);
  });

  it("forwards AbortSignal, stays fresh for a minute and applies the discovery retry policy", async () => {
    const points = vi.fn().mockResolvedValue({ points: [], truncated: false });
    const options = marketMapPointsQueryOptions({ points } as unknown as MarketMapClient, params);
    const signal = new AbortController().signal;
    await options.queryFn?.({ signal } as never);
    expect(points).toHaveBeenCalledWith(params, signal);
    expect(options.staleTime).toBe(60_000);

    const retry = options.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new BackendApiError(429, "slow", undefined, { retryAfterMs: 2_000 }))).toBe(
      true,
    );
    expect(retry(2, new BackendApiError(503, "busy"))).toBe(true);
    expect(retry(3, new BackendApiError(503, "busy"))).toBe(false);
    expect(retry(0, new BackendApiError(400, "bad"))).toBe(false);
  });

  it("honors Retry-After and adds bounded jitter", () => {
    const limited = new BackendApiError(429, "slow", undefined, { retryAfterMs: 4_000 });
    expect(isRetryableDiscoveryError(limited)).toBe(true);
    expect(discoveryRetryDelayMs(0, limited, () => 0.5)).toBe(4_125);
    expect(discoveryRetryDelayMs(1, new BackendApiError(503, "busy"), () => 0)).toBe(2_000);
  });
});

describe("market map facets query", () => {
  it("is keyed by the exact boxes and calls the facets route", async () => {
    const box = { minLng: 35, minLat: -5, maxLng: 41, maxLat: 1 };
    const near = marketMapKeys.facets({ ...params, bounds: [box] });
    const far = marketMapKeys.facets({ ...params, bounds: [{ ...box, minLng: 36 }] });
    expect(near).not.toEqual(far);
    expect(near[3]).toMatchObject({ bounds: [[35, -5, 41, 1]] });

    const facets = vi.fn().mockResolvedValue({
      tagFacets: [],
      postVoucherFacets: [],
      postPoolFacets: [],
    });
    const options = marketMapFacetsQueryOptions({ facets } as unknown as MarketMapClient, {
      ...params,
      bounds: [box],
    });
    await options.queryFn?.({ signal: undefined } as never);
    expect(facets).toHaveBeenCalledWith({ ...params, bounds: [box] }, undefined);
  });
});
