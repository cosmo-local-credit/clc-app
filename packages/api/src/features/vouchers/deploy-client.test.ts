import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import type { OtxRecord } from "../auth/client";
import { createVoucherDeployClient, getVoucherTrackingOutcome } from "./deploy-client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createVoucherDeployClient(createHttpClient({ baseUrl: "https://api.test" }));

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voucher deploy client", () => {
  it("posts the complete voucher payload to the live token deployment endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, { trackingId: "tracking-1" }));
    vi.stubGlobal("fetch", fetcher);
    const payload = {
      name: "Kilifi Harvest",
      symbol: "KHV",
      decimals: "6",
      owner: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
      description: "Fresh food",
      voucherUoa: "KES",
      voucherValue: 1,
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
      iconUrl: "https://cdn.test/voucher/icon.webp",
      bannerUrl: "https://cdn.test/voucher/banner.webp",
      tags: ["Agriculture"],
    };

    await expect(api.deployVoucher(payload)).resolves.toEqual({ trackingId: "tracking-1" });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/contracts/token"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
  });
});

function record(overrides: Partial<OtxRecord> = {}): OtxRecord {
  return {
    id: 1,
    trackingId: "tracking-1",
    otxType: "TOKEN_PROXY_DEPLOY",
    txHash: "0xabc",
    nonce: 1,
    replaced: false,
    createdAt: "2026-08-21T00:00:00Z",
    status: "SUCCESS",
    ...overrides,
  };
}

describe("getVoucherTrackingOutcome", () => {
  it("reports success on the OTX type clc-core actually writes", () => {
    // store.TOKEN_PROXY_DEPLOY, the value internal/worker/erc20.go hands to
    // insertTrackedTx.
    expect(getVoucherTrackingOutcome({ otx: [record()] })).toMatchObject({ kind: "success" });
  });

  // This was the bug: TOKEN_DEPLOY is the River job kind (DeployTokenArgs.Kind()),
  // which never appears on /otx/track. Matching it meant a voucher that deployed
  // fine sat on "Publishing…" forever, because the outcome never left pending and
  // the contract query that carries the new address never enabled.
  it("does not mistake the River job kind for the deploy transaction", () => {
    expect(getVoucherTrackingOutcome({ otx: [record({ otxType: "TOKEN_DEPLOY" })] })).toEqual({
      kind: "pending",
    });
  });

  it("is pending until the deploy record lands", () => {
    expect(getVoucherTrackingOutcome(undefined)).toEqual({ kind: "pending" });
    expect(getVoucherTrackingOutcome({ otx: [] })).toEqual({ kind: "pending" });
    expect(getVoucherTrackingOutcome({ otx: [record({ status: "PENDING" })] })).toEqual({
      kind: "pending",
    });
  });

  it.each(["REVERTED", "FAILED"])("reports a terminal %s as an error", (status) => {
    expect(getVoucherTrackingOutcome({ otx: [record({ status })] })).toMatchObject({
      kind: "error",
      error: `Transaction failed on-chain (${status}).`,
    });
  });

  // A gas bump leaves the superseded attempt in the response. Reading its status
  // would report a failure for a transaction that was replaced, not lost.
  it("ignores a replaced attempt in favour of the current one", () => {
    const outcome = getVoucherTrackingOutcome({
      otx: [
        record({ id: 1, replaced: true, status: "REVERTED" }),
        record({ id: 2, status: "SUCCESS" }),
      ],
    });
    expect(outcome).toMatchObject({ kind: "success" });
  });

  // Every record being replaced must not read as "nothing sent".
  it("falls back to the unfiltered list when every record is replaced", () => {
    expect(
      getVoucherTrackingOutcome({ otx: [record({ replaced: true, status: "SUCCESS" })] }),
    ).toMatchObject({ kind: "success" });
  });
});
