import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { createNamesClient } from "./client";

const api = createNamesClient(createHttpClient({ baseUrl: "https://api.test" }));

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

describe("names client", () => {
  it("normalizes the name before asking, and returns what the backend compared", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ kind: "voucher", name: "Community Market", available: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getNameAvailability("voucher", "  Community   Market  ")).resolves.toEqual({
      kind: "voucher",
      name: "Community Market",
      available: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.test/api/v2/names?kind=voucher&name=Community+Market",
    );
  });

  it("passes an exclude address through for a rename check", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ kind: "pool", name: "Kilifi Growers", available: true }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getNameAvailability("pool", "Kilifi Growers", {
      exclude: "0x33c573149db22e759fB9A38Bcc461C12855c2633",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "exclude=0x33c573149db22e759fB9A38Bcc461C12855c2633",
    );
  });

  // The check is advisory, so an answer the client cannot read must never be the
  // reason someone is told their name is taken.
  it("reads an unusable answer as available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ kind: "voucher" })));
    await expect(api.getNameAvailability("voucher", "Community Market")).resolves.toEqual({
      kind: "voucher",
      name: "Community Market",
      available: true,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: "no" })));
    await expect(api.getNameAvailability("voucher", "Community Market")).resolves.toMatchObject({
      available: true,
    });
  });

  it("refuses to ask about a blank name", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.getNameAvailability("voucher", "   ")).rejects.toThrow(
      "A name to check is required.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
