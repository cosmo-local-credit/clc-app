import type { CreditRoutesPage } from "@clc/api/features/credit-router/client";
import { describe, expect, it } from "vite-plus/test";

import {
  creditRouteHopRefs,
  creditRouteKey,
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
});
