import type { CreditRoutesPage } from "@clc/api/features/credit-router/client";
import { describe, expect, it } from "vite-plus/test";

import {
  creditPayOption,
  creditRouteHopRefs,
  creditRouteKey,
  creditRouteShortfall,
  creditRouteVouchers,
  mergeCreditRouteGroups,
} from "./credit-routes";

const A = "0xC1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const B = "0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2";
const C = "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";
const D = "0xd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4";
const P1 = "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1";
const P2 = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";

const hop = (pool: string, tokenIn: string, tokenOut: string) => ({
  pool: { address: pool as `0x${string}`, name: pool },
  tokenIn: tokenIn as `0x${string}`,
  tokenOut: tokenOut as `0x${string}`,
  feePpm: "0",
  feeSource: "pair" as const,
  protocolFeePpm: "20000",
});

const route = (id: string, hops: ReturnType<typeof hop>[]) => ({
  id,
  hops,
  rate: null,
  maxAmountIn: null,
  maxAmountOut: null,
  maxIsExact: false,
  limitedBy: null,
  effectiveFeePpm: "0",
});

const page = (inputs: CreditRoutesPage["inputs"]) =>
  ({ inputs, fallbackPools: [], cursor: null }) as unknown as CreditRoutesPage;

describe("credit routes", () => {
  it("continues a voucher's group across pages in the server's order", () => {
    const first = page([
      { voucher: A as `0x${string}`, walletBalance: "1", routes: [route("a1", [hop(P1, A, C)])] },
    ]);
    const second = page([
      {
        voucher: A.toLowerCase() as `0x${string}`,
        walletBalance: "1",
        routes: [route("a2", [hop(P1, A, B), hop(P2, B, C)])],
      },
      { voucher: D as `0x${string}`, walletBalance: "2", routes: [route("d1", [hop(P2, D, C)])] },
    ]);
    const groups = mergeCreditRouteGroups([first, second]);
    expect(groups.map((group) => group.voucher)).toEqual([A, D]);
    expect(groups[0]!.routes.map((entry) => entry.id)).toEqual(["a1", "a2"]);
    // Merging never writes into the cached pages.
    expect(first.inputs[0]!.routes).toHaveLength(1);
    expect(mergeCreditRouteGroups(undefined)).toEqual([]);
  });

  it("names a route by its ordered pools and vouchers, whatever the case", () => {
    const twoHop = route("x", [hop(P1, A, B), hop(P2, B, C)]);
    expect(creditRouteKey(twoHop)).toBe(
      creditRouteKey(route("y", [hop(P1.toUpperCase().replace("0X", "0x"), A, B), hop(P2, B, C)])),
    );
    expect(creditRouteKey(twoHop)).not.toBe(
      creditRouteKey(route("z", [hop(P2, B, C), hop(P1, A, B)])),
    );
    expect(creditRouteHopRefs(twoHop)).toEqual([
      { pool: P1, tokenIn: A, tokenOut: B },
      { pool: P2, tokenIn: B, tokenOut: C },
    ]);
    expect(creditRouteVouchers(twoHop)).toEqual([A, B, C]);
  });

  it("stands a voucher for its first route until the amount is priced", () => {
    const direct = route("direct", [hop(P1, A, C)]);
    const bridged = route("bridged", [hop(P1, A, B), hop(P2, B, C)]);
    const group = { voucher: A as `0x${string}`, walletBalance: "1", routes: [direct, bridged] };

    const idle = creditPayOption(group, "idle");
    expect(idle?.route).toBe(direct);
    expect(idle?.others).toEqual([bridged]);
    expect(idle?.state).toBe("idle");
    expect(creditPayOption(group, "pending")?.state).toBe("pending");
    expect(creditPayOption({ ...group, routes: [] }, "idle")).toBeNull();
  });

  it("stands a priced voucher for the first route that carries the amount", () => {
    const refused = { ...route("full", [hop(P1, A, C)]), carriesAmount: false };
    const carries = { ...route("open", [hop(P1, A, B), hop(P2, B, C)]), carriesAmount: true };
    const group = { voucher: A as `0x${string}`, walletBalance: "1", routes: [refused, carries] };

    const option = creditPayOption(group, "priced");
    expect(option?.route).toBe(carries);
    expect(option?.others).toEqual([refused]);
    expect(option?.state).toBe("carries");
    // When none carries, the first route stands, refused.
    const none = creditPayOption({ ...group, routes: [refused] }, "priced");
    expect(none?.route).toBe(refused);
    expect(none?.state).toBe("refused");
  });

  it("keeps the route the person chose while it is listed, carrying or not", () => {
    const carries = { ...route("open", [hop(P1, A, C)]), carriesAmount: true };
    const refused = { ...route("full", [hop(P1, A, B), hop(P2, B, C)]), carriesAmount: false };
    const group = { voucher: A as `0x${string}`, walletBalance: "1", routes: [carries, refused] };

    const chosen = creditPayOption(group, "priced", creditRouteKey(refused));
    expect(chosen?.route).toBe(refused);
    expect(chosen?.others).toEqual([carries]);
    expect(chosen?.state).toBe("refused");
    // A choice the listing no longer holds falls back to the best route.
    const gone = creditPayOption(group, "priced", creditRouteKey(route("x", [hop(P2, A, C)])));
    expect(gone?.route).toBe(carries);
  });

  it("names why a route falls short: the wallet, a pool, or something else", () => {
    expect(
      creditRouteShortfall({ refusal: { reason: "wallet_balance", hop: 0 }, limitedBy: null }),
    ).toBe("wallet");
    expect(creditRouteShortfall({ limitedBy: "wallet" })).toBe("wallet");
    expect(
      creditRouteShortfall({ refusal: { reason: "deposit_cap", hop: 1 }, limitedBy: "wallet" }),
    ).toBe("pool");
    expect(
      creditRouteShortfall({ refusal: { reason: "liquidity", hop: 0 }, limitedBy: null }),
    ).toBe("pool");
    expect(creditRouteShortfall({ limitedBy: "deposit_cap" })).toBe("pool");
    expect(
      creditRouteShortfall({ refusal: { reason: "retired", hop: 0 }, limitedBy: "wallet" }),
    ).toBe("other");
    expect(creditRouteShortfall({ limitedBy: null })).toBe("other");
  });
});
