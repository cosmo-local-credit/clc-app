import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  resolveEnsRecipient,
  resolvePhoneRecipient,
  reverseResolveAddress,
} from "./recipient-resolution-client";

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

  it("resolves an ENS name with the ENS resolver endpoint", async () => {
    const fetcher = mockJson({
      ok: true,
      description: "Address resolved",
      result: { address: "0x000000000000000000000000000000000000dEaD" },
    });

    await expect(resolveEnsRecipient("alice.sarafu.eth")).resolves.toEqual({
      address: "0x000000000000000000000000000000000000dEaD",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://resolver.v3.grassecon.net/api/v1/resolve/alice.sarafu.eth",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("reverse resolves an address when a name exists", async () => {
    const fetcher = mockJson({
      ok: true,
      description: "Name reverse resolved",
      result: { name: "admin.sarafu.eth" },
    });

    await expect(
      reverseResolveAddress("0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439"),
    ).resolves.toEqual({ name: "admin.sarafu.eth" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://resolver.v3.grassecon.net/api/v1/resolve/reverse/0x5523058cdFfe5F3c1EaDADD5015E55C6E00fb439",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("treats a missing reverse ENS as optional", async () => {
    mockJson({ ok: false, description: "not found" }, 404);

    await expect(
      reverseResolveAddress("0xa316408425cF17F1827483dee621c6C3A9B5fad4"),
    ).resolves.toBeNull();
  });
});
