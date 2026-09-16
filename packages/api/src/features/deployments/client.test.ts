import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createDeploymentsClient } from "./client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createDeploymentsClient(createHttpClient({ baseUrl: "https://api.test" }));

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

    await expect(api.getTokenTags()).resolves.toEqual(["Market", "Food"]);
  });

  it("treats a 204 contract lookup as deployment still pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(204)));

    await expect(api.getDeploymentContract("tracking-1", "POOL")).resolves.toBeNull();
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
            admin: "0x2222222222222222222222222222222222222222",
            name,
            symbol,
            status: "CONFIRMED",
            decimals: 6,
          },
        }),
      ),
    );

    await expect(api.getDeploymentContract("tracking-1", type)).resolves.toEqual({
      address: "0x1111111111111111111111111111111111111111",
      admin: "0x2222222222222222222222222222222222222222",
      name,
      symbol,
      status: "CONFIRMED",
      decimals: 6,
    });
  });

  it("keeps decimals null when the backend omits them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          type: "TOKEN",
          contract: {
            address: "0x1111111111111111111111111111111111111111",
            name: "Kilifi Harvest",
            symbol: "KHV",
            status: "CONFIRMED",
          },
        }),
      ),
    );

    await expect(api.getDeploymentContract("tracking-1", "TOKEN")).resolves.toMatchObject({
      decimals: null,
      admin: null,
    });
  });

  it("rejects a contract from a different deployment type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(200, { type: "TOKEN", contract: {} })),
    );

    await expect(api.getDeploymentContract("tracking-1", "POOL")).rejects.toThrow(
      "Tracking ID does not belong to a pool deployment.",
    );
  });
});
