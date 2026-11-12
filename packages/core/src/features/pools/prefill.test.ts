import { describe, expect, it } from "vite-plus/test";

import { CELO_MAINNET_CHAIN_ID } from "../../lib/constants/celo";
import { parsePoolPrefill, poolPrefillForChain, poolPrefillHref } from "./prefill";

const GNOSIS = 100;
const DEFAULTS = { unitOfAccount: "KES", feePolicyDefault: "0" };
const v1 = (fields: Record<string, unknown>) => ({ v: 1, ...fields });

describe("parsePoolPrefill", () => {
  it("ignores the whole prefill without v=1", () => {
    expect(parsePoolPrefill({ name: "Kibera Growers" })).toBeNull();
  });

  it("validates each field with the pool form's schema", () => {
    expect(
      parsePoolPrefill(
        v1({
          name: "Kibera Growers",
          symbol: "kbg",
          pricing: "decimal",
          feePolicyDefault: "2.5",
          unitOfAccount: "usd",
        }),
      )?.values,
    ).toEqual({
      name: "Kibera Growers",
      symbol: "KBG",
      pricing: "decimal",
      feePolicyDefault: "2.5",
      unitOfAccount: "USD",
    });
    expect(parsePoolPrefill(v1({ pricing: "magic", feePolicyDefault: "101" }))?.values).toEqual({});
  });

  it("drops a fee that arrived as a bare number", () => {
    expect(parsePoolPrefill(v1({ feePolicyDefault: 2 }))?.values).toEqual({});
  });

  it("accepts feesDecoupled bare or quoted, and nothing else", () => {
    expect(parsePoolPrefill(v1({ feesDecoupled: true }))?.values).toEqual({ feesDecoupled: true });
    expect(parsePoolPrefill(v1({ feesDecoupled: "true" }))?.values).toEqual({
      feesDecoupled: true,
    });
    expect(parsePoolPrefill(v1({ feesDecoupled: false }))?.values).toEqual({
      feesDecoupled: false,
    });
    expect(parsePoolPrefill(v1({ feesDecoupled: "yes" }))?.values).toEqual({});
    expect(parsePoolPrefill(v1({ feesDecoupled: 1 }))?.values).toEqual({});
  });

  it("never carries the fee recipient or the terms acceptance", () => {
    const parsed = parsePoolPrefill(
      v1({
        name: "Kibera Growers",
        feeAddress: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
        acceptedTerms: true,
        imageUrl: "https://images.example.org/a.jpg",
      }),
    );

    expect(parsed?.values).toEqual({ name: "Kibera Growers" });
  });
});

describe("poolPrefillForChain", () => {
  it("falls back from oracle to relative when the unit has no feed on the chain", () => {
    expect(
      poolPrefillForChain({ pricing: "oracle", unitOfAccount: "KES" }, GNOSIS, DEFAULTS).pricing,
    ).toBe("relative");
    expect(poolPrefillForChain({ pricing: "oracle" }, GNOSIS, DEFAULTS).pricing).toBe("relative");
    expect(
      poolPrefillForChain(
        { pricing: "oracle", unitOfAccount: "KES" },
        CELO_MAINNET_CHAIN_ID,
        DEFAULTS,
      ).pricing,
    ).toBe("oracle");
    expect(
      poolPrefillForChain(
        { pricing: "oracle", unitOfAccount: "TZS" },
        CELO_MAINNET_CHAIN_ID,
        DEFAULTS,
      ).pricing,
    ).toBe("relative");
    expect(
      poolPrefillForChain({ pricing: "oracle", unitOfAccount: "USD" }, GNOSIS, DEFAULTS).pricing,
    ).toBe("oracle");
  });

  it("ignores feesDecoupled when the fee is zero", () => {
    expect(poolPrefillForChain({ feesDecoupled: true }, GNOSIS, DEFAULTS)).toEqual({});
    expect(
      poolPrefillForChain({ feesDecoupled: true, feePolicyDefault: "0" }, GNOSIS, DEFAULTS),
    ).toEqual({ feePolicyDefault: "0" });
    expect(
      poolPrefillForChain({ feesDecoupled: true, feePolicyDefault: "1" }, GNOSIS, DEFAULTS),
    ).toEqual({ feesDecoupled: true, feePolicyDefault: "1" });
  });
});

describe("poolPrefillHref", () => {
  it("writes feesDecoupled bare and quotes a numeric fee", () => {
    expect(
      poolPrefillHref({ name: "Kibera Growers", feePolicyDefault: "2", feesDecoupled: true }),
    ).toBe(
      "/pools/create/pool?v=1&name=Kibera+Growers&feePolicyDefault=%222%22&feesDecoupled=true",
    );
  });
});
