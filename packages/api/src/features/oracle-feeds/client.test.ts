import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createOracleFeedsClient } from "./client";

const api = createOracleFeedsClient(createHttpClient({ baseUrl: "https://api.test" }));

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("oracle feeds client", () => {
  it("asks for the given chain and normalizes each feed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        feeds: [
          {
            id: 7,
            chainId: 100,
            name: "EUR",
            address: "0xab70bcb260073d036d1660201e9d5405f5829b7a",
            description: "EUR / USD",
            decimals: 8,
            maxStalenessSeconds: 93600,
            createdAt: "2026-11-12T00:00:00Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.listOracleFeeds(100)).resolves.toEqual([
      {
        id: "7",
        chainId: 100,
        name: "EUR",
        address: "0xab70BCB260073d036d1660201e9d5405F5829b7a",
        description: "EUR / USD",
        decimals: 8,
        maxStalenessSeconds: 93600,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v2/oracle-feeds?chainId=100",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("reads rows seeded before the metadata columns as unknown, and zero as no bound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          feeds: [
            {
              id: "3",
              chainId: 100,
              name: "USD",
              address: "0x26C31ac71010aF62E6B486D1132E266D6298857D",
              description: null,
              maxStalenessSeconds: 0,
            },
          ],
        }),
      ),
    );

    await expect(api.listOracleFeeds(100)).resolves.toEqual([
      expect.objectContaining({ description: null, decimals: null, maxStalenessSeconds: null }),
    ]);
  });

  it("drops malformed rows and rows for another chain rather than failing the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          feeds: [
            { id: 1, chainId: 100, name: "BAD", address: "0x12" },
            {
              id: 2,
              chainId: 42220,
              name: "EUR",
              address: "0x3D207061Dbe8E2473527611BFecB87Ff12b28dDa",
            },
            {
              id: 3,
              chainId: 100,
              name: "EUR",
              address: "0xab70BCB260073d036d1660201e9d5405F5829b7a",
            },
          ],
        }),
      ),
    );

    const feeds = await api.listOracleFeeds(100);
    expect(feeds.map((feed) => feed.id)).toEqual(["3"]);
  });

  it("returns an empty list when the backend sends none", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({})));
    await expect(api.listOracleFeeds(100)).resolves.toEqual([]);
  });
});
