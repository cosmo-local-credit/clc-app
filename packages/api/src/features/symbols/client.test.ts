import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createSymbolsClient } from "./client";

const api = createSymbolsClient(createHttpClient({ baseUrl: "https://api.test" }));

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, description: "test", result })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("symbols client", () => {
  it("asks for one kind and prefix and uppercases what comes back", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ kind: "voucher", prefix: "KVKS", taken: ["kvks", "KVKS1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getTakenSymbols("voucher", "kvks")).resolves.toEqual({
      kind: "voucher",
      prefix: "KVKS",
      taken: ["KVKS", "KVKS1"],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.test/api/v2/symbols?kind=voucher&prefix=KVKS",
    );
  });

  it("treats a missing or malformed taken list as empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ kind: "pool", prefix: "KGP" })));
    await expect(api.getTakenSymbols("pool", "KGP")).resolves.toMatchObject({ taken: [] });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ taken: ["KGP", 7, "kgp-1", null, "KGP12"] })),
    );
    await expect(api.getTakenSymbols("pool", "KGP")).resolves.toMatchObject({
      taken: ["KGP", "KGP12"],
    });
  });

  it("refuses a prefix the backend would reject before sending it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getTakenSymbols("voucher", "KV-KS")).rejects.toThrow(/prefix/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
