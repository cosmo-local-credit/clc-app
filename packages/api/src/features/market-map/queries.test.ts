import { describe, expect, it, vi } from "vite-plus/test";
import { BackendApiError } from "../../client/errors";
import type { MarketMapClient, MarketMapParams } from "./client";
import {
  discoveryRetryDelayMs,
  isRetryableDiscoveryError,
  marketMapKeys,
  marketMapQueryOptions,
} from "./queries";

const params: MarketMapParams = {
  bounds: [{ minLng: 35, minLat: -5, maxLng: 41, maxLat: 1 }],
  zoom: 8,
  kinds: ["voucher", "want"],
  filter: { term: "market", tags: ["Food"], tagMatch: "any" },
  creditablePools: [{ chainId: 100, address: `0x${"A".repeat(40)}` }],
};

describe("market map query", () => {
  it("isolates bounds, zoom, filters, kinds and canonical pool addresses", () => {
    expect(marketMapKeys.list(params)).toEqual([
      "clc",
      "market-map",
      {
        ...params,
        bounds: [[35, -5, 41, 1]],
        kinds: ["voucher", "want"],
        filter: { term: "market", tags: ["Food"], tagMatch: "any" },
        creditablePools: [`100:0x${"a".repeat(40)}`],
      },
    ]);
  });

  it("forwards AbortSignal and applies the discovery retry policy", async () => {
    const list = vi.fn().mockResolvedValue({ features: [] });
    const options = marketMapQueryOptions({ list } as unknown as MarketMapClient, params);
    const signal = new AbortController().signal;
    await options.queryFn?.({ signal } as never);
    expect(list).toHaveBeenCalledWith(params, signal);

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
