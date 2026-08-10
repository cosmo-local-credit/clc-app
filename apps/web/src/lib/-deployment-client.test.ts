import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { getDeploymentContract, getTokenTags } from "./deployment-client";

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

describe("deployment client", () => {
  it("loads the shared token tag vocabulary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(200, { tags: [" Market ", "Food"] })),
    );

    await expect(getTokenTags()).resolves.toEqual(["Market", "Food"]);
  });

  it("treats a 204 contract lookup as deployment still pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(204)));

    await expect(getDeploymentContract("tracking-1", "POOL")).resolves.toBeNull();
  });

  it.each([
    ["POOL", "Kilifi Growers", "KGP1"],
    ["TOKEN", "Kilifi Harvest", "KHV"],
  ] as const)("normalizes a %s deployment contract", async (type, name, symbol) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          type,
          contract: {
            address: "0x1111111111111111111111111111111111111111",
            name,
            symbol,
            status: "CONFIRMED",
          },
        }),
      ),
    );

    await expect(getDeploymentContract("tracking-1", type)).resolves.toEqual({
      address: "0x1111111111111111111111111111111111111111",
      name,
      symbol,
      status: "CONFIRMED",
    });
  });

  it("rejects a contract from a different deployment type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(200, { type: "TOKEN", contract: {} })),
    );

    await expect(getDeploymentContract("tracking-1", "POOL")).rejects.toThrow(
      "Tracking ID does not belong to a pool deployment.",
    );
  });
});
