import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { searchRecipientUsers } from "./recipient-resolution-client";

function mockJson(body: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recipient search client", () => {
  it("queries the authenticated Core user-search endpoint", async () => {
    const fetcher = mockJson({
      ok: true,
      result: {
        users: [
          {
            name: "Alice",
            address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
          },
        ],
      },
    });

    await expect(searchRecipientUsers({ kind: "phone", query: "+254711" })).resolves.toEqual([
      {
        name: "Alice",
        address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
      },
    ]);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v2/users/search");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      kind: "phone",
      query: "+254711",
    });
  });

  it("rejects an invalid address returned by Core", async () => {
    mockJson({
      ok: true,
      result: { users: [{ name: "Alice", address: "not-an-address" }] },
    });

    await expect(searchRecipientUsers({ kind: "ens", query: "ali" })).rejects.toThrow(
      "invalid address",
    );
  });
});
