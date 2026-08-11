import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { OtxRecord } from "#/features/auth/api/client";
import { deployPool, getPoolTrackingOutcome } from "./pool-deploy-client";

function response(status: number, result?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? "No Content" : "",
    text: () =>
      Promise.resolve(
        status === 204 ? "" : JSON.stringify({ ok: true, description: "test", result }),
      ),
  };
}

function record(id: number, otxType: string, status: string): OtxRecord {
  return {
    id,
    trackingId: "tracking-1",
    otxType,
    txHash: `0x${id}`,
    nonce: id,
    replaced: false,
    createdAt: "2026-08-10T00:00:00Z",
    status,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pool deploy client", () => {
  it("posts only the supported pool payload to the live deployment endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, { trackingId: "tracking-1" }));
    vi.stubGlobal("fetch", fetcher);
    const payload = {
      name: "Kilifi Growers",
      symbol: "KGP1",
      decimals: "6",
      owner: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
      quoterType: "oracle" as const,
      feesDecoupled: false,
      feePolicyDefault: "1",
      baseCurrency: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",
      description: "A pool for Kilifi growers.",
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
      tags: ["Agriculture"],
    };

    await expect(deployPool(payload)).resolves.toEqual({ trackingId: "tracking-1" });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/contracts/pool"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
  });
});

describe("pool OTX outcome", () => {
  it("stays pending after an early deployment succeeds", () => {
    expect(
      getPoolTrackingOutcome({
        otx: [
          record(1, "POOL_TOKEN_INDEX_DEPLOY", "SUCCESS"),
          record(2, "POOL_LIMITER_DEPLOY", "IN_NETWORK"),
          record(5, "POOL_PROXY_DEPLOY", "PENDING"),
        ],
      }),
    ).toEqual({ kind: "pending" });
  });

  it("succeeds only when POOL_PROXY_DEPLOY succeeds", () => {
    const poolRecord = record(5, "POOL_PROXY_DEPLOY", "SUCCESS");
    expect(
      getPoolTrackingOutcome({
        otx: [record(1, "POOL_TOKEN_INDEX_DEPLOY", "SUCCESS"), poolRecord],
      }),
    ).toEqual({ kind: "success", otx: poolRecord });
  });

  it("fails when any current pool deployment stage reaches a terminal failure", () => {
    expect(
      getPoolTrackingOutcome({
        otx: [
          record(1, "POOL_TOKEN_INDEX_DEPLOY", "SUCCESS"),
          record(3, "POOL_FEE_POLICY_DEPLOY", "REVERTED"),
          record(5, "POOL_PROXY_DEPLOY", "PENDING"),
        ],
      }),
    ).toEqual({ kind: "error", error: "Transaction failed on-chain (REVERTED)." });
  });
});
