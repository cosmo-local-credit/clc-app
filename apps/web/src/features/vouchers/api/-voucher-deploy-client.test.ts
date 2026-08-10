import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  deployVoucher,
  getVoucherDeploymentContract,
  getVoucherTags,
} from "./voucher-deploy-client";

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
      tags: ["Agriculture"],
    };

    await expect(deployVoucher(payload)).resolves.toEqual({ trackingId: "tracking-1" });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/contracts/token"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
  });

  it("loads the select-only token tag vocabulary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(200, { tags: [" Market ", "Food"] })),
    );
    await expect(getVoucherTags()).resolves.toEqual(["Market", "Food"]);
  });

  it("treats a 204 contract lookup as deployment still pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(204)));
    await expect(getVoucherDeploymentContract("tracking-1")).resolves.toBeNull();
  });

  it("keeps a deployment pending until the contract has a valid address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          type: "TOKEN",
          contract: { address: null, name: "Kilifi Harvest", symbol: "KHV", status: "PENDING" },
        }),
      ),
    );

    await expect(getVoucherDeploymentContract("tracking-1")).resolves.toEqual({
      address: null,
      name: "Kilifi Harvest",
      symbol: "KHV",
      status: "PENDING",
    });
  });
});
