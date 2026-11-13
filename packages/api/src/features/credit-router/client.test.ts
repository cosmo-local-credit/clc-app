import { QueryClient } from "@tanstack/react-query";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError, isRetryableBackendError } from "../../client/errors";
import { createHttpClient } from "../../client/http-client";
import { createCreditRouterClient, creditRouterFailure } from "./client";
import {
  creditReachQueryOptions,
  creditRouterKeys,
  creditRoutesInfiniteQueryOptions,
  routedSwapQueryOptions,
} from "./queries";

const WALLET = "0xA1a1A1a1A1A1A1a1A1a1a1a1a1a1A1A1A1a1A1a1";
const POOL = "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1";
const VOUCHER_A = "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const VOUCHER_C = "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";
const HASH = `0x${"ab".repeat(32)}`;

function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers }));
  const client = createCreditRouterClient(
    createHttpClient({ baseUrl: "https://api.test", fetch: fetcher }),
  );
  return { client, fetcher };
}

const reach = {
  depth: 2,
  asOfBlock: 49254469,
  graphVersion: 812,
  stale: false,
  digest: HASH,
  inputs: [{ voucher: VOUCHER_A, balance: "2500000" }],
  vouchers: [{ address: VOUCHER_C, minHops: 2 }],
  pools: [{ address: POOL, minHops: 1 }],
};

const route = {
  id: "r_1",
  hops: [
    {
      pool: { address: POOL, name: "Market pool" },
      tokenIn: VOUCHER_A,
      tokenOut: VOUCHER_C,
      feePpm: "0",
      feeSource: "default",
      protocolFeePpm: "20000",
    },
  ],
  rate: { amountIn: "1000000", amountOut: "999800" },
  maxAmountIn: "2500000",
  maxAmountOut: "2499500",
  maxIsExact: true,
  limitedBy: "wallet",
  limitedByHop: 0,
  effectiveFeePpm: "200",
};

function routesPage(overrides: Record<string, unknown> = {}) {
  return {
    target: { address: VOUCHER_C, symbol: "JESCA", decimals: 6 },
    asOfBlock: 49254469,
    graphVersion: 812,
    stale: false,
    complete: true,
    inputs: [{ voucher: VOUCHER_A, walletBalance: "2500000", routes: [route] }],
    fallbackPools: [],
    cursor: null,
    ...overrides,
  };
}

describe("credit router client: results", () => {
  it("reads the reach at the requested depth, privately", async () => {
    const { client, fetcher } = stub(200, { ok: true, result: reach });
    const result = await client.reach(2);
    expect(result.pools[0]!.address).toBe(getAddress(POOL));
    expect(result.inputs[0]).toEqual({ voucher: getAddress(VOUCHER_A), balance: "2500000" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test/api/v2/users/me/credit?depth=2");
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("include");
  });

  it("keeps an empty reach as a real, empty answer", async () => {
    const { client } = stub(200, {
      ok: true,
      result: { ...reach, inputs: [], vouchers: [], pools: [] },
    });
    const result = await client.reach(1);
    expect(result.pools).toEqual([]);
    expect(result.stale).toBe(false);
  });

  it("surfaces a stale graph rather than hiding it", async () => {
    const { client } = stub(200, { ok: true, result: routesPage({ stale: true }) });
    expect((await client.routes({ to: VOUCHER_C, depth: 2 })).stale).toBe(true);
  });

  it("asks for routes with an amount and mode, and reads an unknown maximum", async () => {
    const { client, fetcher } = stub(200, {
      ok: true,
      result: routesPage({
        inputs: [
          {
            voucher: VOUCHER_A,
            walletBalance: "2500000",
            routes: [
              {
                ...route,
                maxAmountIn: null,
                maxAmountOut: null,
                maxIsExact: false,
                limitedBy: null,
                carriesAmount: false,
                refusal: { reason: "liquidity", hop: 0 },
              },
            ],
          },
        ],
        fallbackPools: [
          { address: POOL, name: "Market pool", liquidity: "9", accepts: [VOUCHER_A] },
        ],
        cursor: "c2",
      }),
    });
    const page = await client.routes({
      to: VOUCHER_C,
      depth: 2,
      amount: "5000000",
      mode: "exactOutput",
      cursor: "c1",
    });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/v2/users/me/credit/routes");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      to: VOUCHER_C,
      depth: "2",
      amount: "5000000",
      mode: "exactOutput",
      cursor: "c1",
    });
    const listed = page.inputs[0]!.routes[0]!;
    expect(listed.maxAmountIn).toBeNull();
    expect(listed.refusal).toEqual({ reason: "liquidity", hop: 0 });
    expect(listed.hops[0]!.feeSource).toBe("default");
    expect(page.fallbackPools[0]!.accepts).toHaveLength(1);
    expect(page.cursor).toBe("c2");
  });

  it("posts a quote request with checksummed addresses", async () => {
    const quote = {
      quoteId: HASH,
      block: { number: 1, hash: HASH },
      expiresAt: 1794567890,
      mode: "exactInput",
      amountIn: "1000000",
      amountOut: "999800",
      minAmountOut: "999800",
      recipient: WALLET,
      hops: [
        {
          pool: POOL,
          tokenIn: VOUCHER_A,
          tokenOut: VOUCHER_C,
          amountIn: "1000000",
          grossOut: "1000000",
          poolFee: "0",
          protocolFee: "200",
          netOut: "999800",
          minAmountOut: "999800",
          feePpm: "0",
          protocolFeePpm: "20000",
        },
      ],
      fees: { feeFreeAmountOut: "1000000", effectiveFeePpm: "200" },
      surplus: { output: "0", bridge: [] },
      batch: {
        batchedCall: { calls: [{ to: VOUCHER_A, value: "0", data: "0x" }], revertOnFailure: true },
        nonce: "7",
        keyHash: `0x${"00".repeat(32)}`,
        executor: POOL,
        deadline: "1794567890",
        digest: HASH,
      },
      simulation: { ok: true, gasEstimate: null },
      delegated: false,
      eoaNonce: "0",
    };
    const { client, fetcher } = stub(200, { ok: true, result: quote });
    const result = await client.quote({
      route: [{ pool: POOL, tokenIn: VOUCHER_A, tokenOut: VOUCHER_C }],
      mode: "exactInput",
      amount: "1000000",
      recipient: null,
      keyHash: `0x${"00".repeat(32)}`,
    });
    expect(result.delegated).toBe(false);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test/api/v2/users/me/credit/quote");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.route[0]).toEqual({
      pool: getAddress(POOL),
      tokenIn: getAddress(VOUCHER_A),
      tokenOut: getAddress(VOUCHER_C),
    });
    expect(body).toMatchObject({ mode: "exactInput", amount: "1000000", recipient: null });
  });

  it("orders receipt hops and reads a list page", async () => {
    const hop = (index: number) => ({
      index,
      pool: POOL,
      tokenIn: VOUCHER_A,
      tokenOut: VOUCHER_C,
      amountIn: "1",
      minAmountOut: "1",
      recipient: WALLET,
      txHash: null,
      block: null,
      logIndex: null,
      settledAmountIn: null,
      quotedAmountOut: null,
      nominalAmountOut: null,
      amountOut: null,
      poolFee: null,
      protocolFee: null,
      settledAt: null,
    });
    const receipt = {
      swap: {
        trackingId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        chainId: 100,
        wallet: WALLET,
        recipient: WALLET,
        tokenIn: VOUCHER_A,
        tokenOut: VOUCHER_C,
        amountIn: "1",
        minAmountOut: "1",
        hopCount: 2,
        bounded: true,
        deadline: 1794567890,
        createdAt: "2026-11-13T10:00:00Z",
        txHash: null,
        status: null,
        hops: [hop(1), hop(0)],
      },
      settled: false,
      bridgeRemainder: [],
    };
    const { client, fetcher } = stub(200, { ok: true, result: { items: [receipt], cursor: "n" } });
    const page = await client.routedSwaps("abc");
    expect(page.items[0]!.swap.hops.map((h) => h.index)).toEqual([0, 1]);
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      "https://api.test/api/v2/users/me/routed-swaps?cursor=abc",
    );

    const nullHops = stub(200, {
      ok: true,
      result: { ...receipt, swap: { ...receipt.swap, hops: null } },
    });
    expect((await nullHops.client.routedSwap(receipt.swap.trackingId)).swap.hops).toEqual([]);
  });

  it("reports a response that breaks the contract as a protocol error", async () => {
    const { client } = stub(200, { ok: true, result: { ...reach, pools: [{ address: "nope" }] } });
    await expect(client.reach(2)).rejects.toMatchObject({ kind: "protocol" });
  });
});

describe("credit router client: failure states", () => {
  async function failure(status: number, body: unknown, headers?: Record<string, string>) {
    const { client } = stub(status, body, headers);
    const error = await client.reach(2).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BackendApiError);
    return error as BackendApiError;
  }

  it("reads route_unavailable with its reason and hop", async () => {
    const error = await failure(409, {
      ok: false,
      code: "E24",
      description: "route_unavailable",
      result: { state: "route_unavailable", reason: "deposit_cap", hop: 1 },
    });
    expect(creditRouterFailure(error)).toEqual({
      state: "route_unavailable",
      reason: "deposit_cap",
      hop: 1,
    });
  });

  it("reads quote_mismatch", async () => {
    const error = await failure(409, {
      ok: false,
      code: "E25",
      result: { state: "quote_mismatch", hop: 0, local: "1", chain: "2" },
    });
    expect(creditRouterFailure(error)).toEqual({ state: "quote_mismatch", hop: 0 });
  });

  it("reads simulation_failed with the decoded revert", async () => {
    const error = await failure(409, {
      ok: false,
      code: "E26",
      result: {
        state: "simulation_failed",
        revert: { reason: "LimitExceeded", message: "limit", data: "0x1234" },
      },
    });
    expect(creditRouterFailure(error)).toEqual({
      state: "simulation_failed",
      revert: { reason: "LimitExceeded", message: "limit", data: "0x1234" },
    });
  });

  it("reads router_unavailable as a retryable fault, never an empty result", async () => {
    const error = await failure(
      503,
      { ok: false, code: "E27", result: { state: "router_unavailable" } },
      { "retry-after": "5" },
    );
    expect(creditRouterFailure(error)).toEqual({ state: "router_unavailable" });
    expect(isRetryableBackendError(error)).toBe(true);
    expect(error.retryAfterMs).toBe(5_000);
  });

  it("reads a stale cursor so paging restarts", async () => {
    const error = await failure(409, { ok: false, code: "E28", description: "cursor stale" });
    expect(creditRouterFailure(error)).toEqual({ state: "cursor_stale" });
  });

  it("leaves other errors to the caller", async () => {
    const error = await failure(401, { ok: false, code: "E06" });
    expect(creditRouterFailure(error)).toBeNull();
    expect(creditRouterFailure(new Error("x"))).toBeNull();
  });
});

describe("credit router queries", () => {
  const client = createCreditRouterClient(createHttpClient({ baseUrl: "https://api.test" }));

  it("never shares a reach across wallets or depths, and waits for a session", () => {
    const cache = new QueryClient();
    const alice = creditReachQueryOptions(client, "0xAlice", 2);
    cache.setQueryData(alice.queryKey, reach as never);
    expect(
      cache.getQueryData(creditReachQueryOptions(client, "0xBob", 2).queryKey),
    ).toBeUndefined();
    expect(
      cache.getQueryData(creditReachQueryOptions(client, "0xAlice", 1).queryKey),
    ).toBeUndefined();
    expect(creditReachQueryOptions(client, "0xALICE", 2).queryKey).toEqual(alice.queryKey);
    expect(creditReachQueryOptions(client, "", 2).enabled).toBe(false);
  });

  it("keys routes on the wallet and every parameter except the cursor", () => {
    const base = { to: VOUCHER_C, depth: 2 as const };
    expect(creditRouterKeys.routes("0xA", base)).not.toEqual(creditRouterKeys.routes("0xB", base));
    expect(
      creditRouterKeys.routes("0xA", { ...base, amount: "1", mode: "exactOutput" }),
    ).not.toEqual(creditRouterKeys.routes("0xA", { ...base, amount: "1", mode: "exactInput" }));
    const options = creditRoutesInfiniteQueryOptions(client, "0xA", base);
    expect(options.getNextPageParam(routesPage({ cursor: "c" }) as never, [], undefined, [])).toBe(
      "c",
    );
    expect(options.getNextPageParam(routesPage() as never, [], undefined, [])).toBeUndefined();
  });

  it("stops polling a receipt once every hop settled", () => {
    const options = routedSwapQueryOptions(client, "0xA", "id");
    const interval = options.refetchInterval as (query: { state: { data: unknown } }) => unknown;
    expect(interval({ state: { data: undefined } })).toBeGreaterThan(0);
    expect(interval({ state: { data: { settled: true, swap: { status: "SUCCESS" } } } })).toBe(
      false,
    );
    expect(interval({ state: { data: { settled: false, swap: { status: "REVERTED" } } } })).toBe(
      false,
    );
    expect(
      interval({ state: { data: { settled: false, swap: { status: "IN_NETWORK" } } } }),
    ).toBeGreaterThan(0);
  });
});
