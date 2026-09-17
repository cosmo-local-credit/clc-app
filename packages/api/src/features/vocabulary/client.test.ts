import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createVocabularyClient } from "./client";

const api = createVocabularyClient(createHttpClient({ baseUrl: "https://api.test" }));

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("vocabulary client", () => {
  it("loads dynamic offering units", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ units: [" kg ", "Produce Crate"] })),
    );
    await expect(api.getOfferingUnits()).resolves.toEqual(["kg", "Produce Crate"]);
  });

  it("normalizes custom vocabulary usage counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          tags: [{ value: "Urban Farming", vouchers: 2, posts: 1 }],
          units: [{ value: "Produce Crate", offerings: 3 }],
        }),
      ),
    );
    await expect(api.getCustomVocabulary()).resolves.toEqual({
      tags: [
        {
          value: "Urban Farming",
          deployedTokens: 0,
          deployedPools: 0,
          vouchers: 2,
          pools: 0,
          posts: 1,
          offerings: 0,
          total: 3,
        },
      ],
      units: [{ value: "Produce Crate", offerings: 3, total: 3 }],
    });
  });

  it("sends destructive cleanup as a JSON DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ value: "Urban Farming", usage: { vouchers: 2 }, total: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.deleteTag("Urban Farming");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v2/admin/vocabulary/tags",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ value: "Urban Farming" }),
      }),
    );
  });
});
