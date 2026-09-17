import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createPublicClient } from "viem";
import { gnosis } from "viem/chains";
import { createRpcTransport, resolveRpcUrls, RPC_REQUEST_TIMEOUT_MS } from "./rpc-transport";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveRpcUrls", () => {
  it("orders the primary, configured fallbacks, and chain defaults without duplicates", () => {
    expect(
      resolveRpcUrls({
        primary: " https://primary.example ",
        fallbacks: "https://public.example, https://default.example, ,https://public.example",
        defaults: ["https://default.example"],
      }),
    ).toEqual(["https://primary.example", "https://public.example", "https://default.example"]);
  });

  it("uses the chain default when no endpoint is configured", () => {
    expect(
      resolveRpcUrls({
        primary: undefined,
        fallbacks: undefined,
        defaults: ["https://default.example"],
      }),
    ).toEqual(["https://default.example"]);
  });

  it("rejects endpoints that a browser HTTP transport cannot use", () => {
    expect(() =>
      resolveRpcUrls({
        primary: "wss://rpc.example",
        fallbacks: undefined,
        defaults: [],
      }),
    ).toThrow("must use http:// or https://");
  });
});

describe("createRpcTransport", () => {
  it("wraps every endpoint in one bounded, non-retrying fallback transport", () => {
    const transport = createRpcTransport(["https://primary.example", "https://public.example"], {
      rank: false,
    });
    const resolved = transport({ chain: gnosis });
    const candidates = resolved.value?.transports;

    expect(resolved.config.type).toBe("fallback");
    expect(resolved.config.retryCount).toBe(0);
    expect(candidates).toHaveLength(2);
    expect(
      candidates?.map((candidate) => ({
        retryCount: candidate.config.retryCount,
        timeout: candidate.config.timeout,
        url: candidate.value?.url,
      })),
    ).toEqual([
      {
        retryCount: 0,
        timeout: RPC_REQUEST_TIMEOUT_MS,
        url: "https://primary.example",
      },
      {
        retryCount: 0,
        timeout: RPC_REQUEST_TIMEOUT_MS,
        url: "https://public.example",
      },
    ]);
  });

  it("moves to the next endpoint when the first endpoint is unreachable", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedUrls.push(url);
      if (url.startsWith("https://blocked.example")) throw new TypeError("Failed to fetch");

      return new Response(JSON.stringify({ id: 1, jsonrpc: "2.0", result: "0x2a" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    const client = createPublicClient({
      chain: gnosis,
      transport: createRpcTransport(["https://blocked.example", "https://available.example"], {
        rank: false,
      }),
    });

    await expect(client.getBlockNumber()).resolves.toBe(42n);
    expect(requestedUrls).toEqual(["https://blocked.example/", "https://available.example/"]);
  });
});
