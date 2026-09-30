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
  it.each(["tag", "unit"] as const)("renames a %s through its PUT endpoint", async (kind) => {
    const fetchMock = vi.fn().mockResolvedValue(response({ value: "New value" }));
    vi.stubGlobal("fetch", fetchMock);

    await api.renameValue(kind, "Old value", "New value");

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.test/api/v2/admin/vocabulary/${kind === "tag" ? "tags" : "units"}`,
      expect.objectContaining({
        method: "PUT",
        cache: "no-store",
        body: JSON.stringify({ value: "Old value", replacement: "New value" }),
      }),
    );
  });

  it("propagates a rename conflict to the editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        text: async () =>
          JSON.stringify({
            ok: false,
            description: "a vocabulary value with this name already exists",
          }),
      }),
    );
    await expect(api.renameValue("tag", "Old", "Existing")).rejects.toThrow(
      "a vocabulary value with this name already exists",
    );
  });

  it("loads dynamic offering units", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ units: [" kg ", "Produce Crate"] })),
    );
    await expect(api.getOfferingUnits()).resolves.toEqual(["kg", "Produce Crate"]);
  });

  it("normalizes vocabulary usage counts and keeps built-ins apart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          tags: [
            { value: "Urban Farming", isCustom: true, vouchers: 2, posts: 1 },
            { value: "Agriculture", isCustom: false, pools: 1 },
          ],
          units: [
            { value: "Produce Crate", isCustom: true, offerings: 3 },
            { value: "kg", isCustom: false },
          ],
        }),
      ),
    );
    await expect(api.getVocabulary()).resolves.toEqual({
      tags: [
        {
          value: "Urban Farming",
          isCustom: true,
          deployedTokens: 0,
          deployedPools: 0,
          vouchers: 2,
          pools: 0,
          posts: 1,
          offerings: 0,
          total: 3,
        },
        {
          value: "Agriculture",
          isCustom: false,
          deployedTokens: 0,
          deployedPools: 0,
          vouchers: 0,
          pools: 1,
          posts: 0,
          offerings: 0,
          total: 1,
        },
      ],
      units: [
        { value: "Produce Crate", isCustom: true, offerings: 3, total: 3 },
        { value: "kg", isCustom: false, offerings: 0, total: 0 },
      ],
    });
  });

  // Only an explicit false is a built-in; a missing flag must never make a
  // custom value undeletable.
  it("treats a row without the flag as custom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ tags: [{ value: "Urban Farming" }], units: [] })),
    );
    const { tags } = await api.getVocabulary();
    expect(tags[0]?.isCustom).toBe(true);
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
