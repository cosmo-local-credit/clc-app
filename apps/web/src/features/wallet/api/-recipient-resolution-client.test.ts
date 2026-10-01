import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resolvePhoneRecipient } from "./recipient-resolution-client";

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

describe("recipient resolution client", () => {
  it("resolves a phone number with the phone lookup endpoint", async () => {
    const fetcher = mockJson({
      ok: true,
      description: "Address resolved",
      result: { address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4" },
    });

    await expect(resolvePhoneRecipient("+254711777734")).resolves.toEqual({
      address: "0xa316408425cF17F1827483dee621c6C3A9B5fad4",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://kvviseru.v3.grassecon.net/api/v1/lookup/address/+254711777734",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("rejects malformed phone lookup addresses", async () => {
    mockJson({ result: { address: "0x1234" } });
    await expect(resolvePhoneRecipient("+254711777734")).rejects.toThrow();
  });
});
