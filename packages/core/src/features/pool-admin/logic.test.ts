import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vite-plus/test";

import {
  buildAddPoolVoucherCalls,
  buildRemovePoolVoucherCalls,
  buildSetPoolFeeAddressCalls,
  buildWithdrawPoolLiquidityCalls,
  limiterSetLimitForAbi,
  oracleQuoterSetOracleAbi,
  oracleQuoterSetOracleWithStalenessAbi,
  poolVoucherCapFromUnitValue,
  poolVoucherRateSchema,
  poolVoucherUnitValueFromCap,
  seedPoolVoucherRateInput,
  toPoolVoucherRateConfig,
  relativeQuoterSetPriceIndexValueAbi,
  swapPoolSetFeeAddressAbi,
  swapPoolWithdrawLiquidityAbi,
  tokenIndexAddAbi,
  tokenIndexRemoveAbi,
} from "./logic";

const POOL = "0x8e0a000000000000000000000000000000000b41" as const;
const TOKEN = "0x3aa7000000000000000000000000000000000102" as const;
const REGISTRY = "0x61a8000000000000000000000000000000007001" as const;
const LIMITER = "0x4d90000000000000000000000000000000000a1c" as const;
const QUOTER = "0xb91c000000000000000000000000000000007d20" as const;
const AGGREGATOR = "0x0826000000000000000000000000000000005e9d" as const;
const RECIPIENT = "0x9911000000000000000000000000000000002244" as const;

function base() {
  return {
    poolAddress: POOL,
    tokenAddress: TOKEN,
    registryAddress: REGISTRY,
    limiterAddress: LIMITER,
    quoterAddress: QUOTER,
    register: true,
  };
}

describe("buildAddPoolVoucherCalls", () => {
  it("registers, caps, then prices, each against its own contract", () => {
    const calls = buildAddPoolVoucherCalls({
      ...base(),
      depositCapRaw: "300000000",
      pricing: { kind: "oracle", aggregatorAddress: AGGREGATOR },
    });

    expect(calls.map((call) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    expect(calls.every((call) => call.value === "0")).toBe(true);

    expect(decodeFunctionData({ abi: tokenIndexAddAbi, data: calls[0]!.data })).toEqual({
      functionName: "add",
      args: [TOKEN],
    });
  });

  it("caps the pool's own holding, not the token's total", () => {
    // Limiter.limitOf is keyed (token, holder) and SwapPool reads it with itself
    // as the holder, so passing the token twice would cap nothing.
    const [, cap] = buildAddPoolVoucherCalls({
      ...base(),
      depositCapRaw: "300000000",
      pricing: { kind: "decimal" },
    });

    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: cap!.data })).toEqual({
      functionName: "setLimitFor",
      args: [TOKEN, POOL, 300000000n],
    });
  });

  it("uses the two-argument setOracle when no staleness override is given", () => {
    const calls = buildAddPoolVoucherCalls({
      ...base(),
      pricing: { kind: "oracle", aggregatorAddress: AGGREGATOR },
    });

    expect(decodeFunctionData({ abi: oracleQuoterSetOracleAbi, data: calls[1]!.data })).toEqual({
      functionName: "setOracle",
      args: [TOKEN, AGGREGATOR],
    });
  });

  it("switches to the three-argument overload for a per-feed staleness bound", () => {
    const calls = buildAddPoolVoucherCalls({
      ...base(),
      pricing: {
        kind: "oracle",
        aggregatorAddress: AGGREGATOR,
        maxStalenessSeconds: "21600",
      },
    });

    expect(
      decodeFunctionData({ abi: oracleQuoterSetOracleWithStalenessAbi, data: calls[1]!.data }),
    ).toEqual({ functionName: "setOracle", args: [TOKEN, AGGREGATOR, 21600n] });
  });

  it("emits no pricing call for a decimal quoter", () => {
    // DecimalQuoter derives everything from token decimals; there is nothing to set.
    const calls = buildAddPoolVoucherCalls({ ...base(), pricing: { kind: "decimal" } });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.to).toBe(REGISTRY);
  });

  it("omits registration when the voucher is already a member", () => {
    // add() reverts TokenAlreadyExists, and the batch is relayed revertOnFailure,
    // so re-registering would discard the cap and price beside it.
    const calls = buildAddPoolVoucherCalls({
      ...base(),
      register: false,
      depositCapRaw: "1000000",
      pricing: { kind: "decimal" },
    });

    expect(calls.map((call) => call.to)).toEqual([LIMITER]);
  });

  it("refuses to build a call against a dependency the catalog has no address for", () => {
    expect(() =>
      buildAddPoolVoucherCalls({
        ...base(),
        registryAddress: null,
        pricing: { kind: "decimal" },
      }),
    ).toThrow(/no token registry address/);

    expect(() =>
      buildAddPoolVoucherCalls({
        ...base(),
        register: false,
        limiterAddress: null,
        depositCapRaw: "1",
        pricing: { kind: "decimal" },
      }),
    ).toThrow(/no limiter address/);

    expect(() =>
      buildAddPoolVoucherCalls({
        ...base(),
        register: false,
        quoterAddress: null,
        pricing: { kind: "oracle", aggregatorAddress: AGGREGATOR },
      }),
    ).toThrow(/no quoter address/);
  });

  it("rejects a zero cap rather than encoding one", () => {
    // Zero is a real setting that means the opposite of unset: the limiter then
    // rejects every deposit.
    expect(() =>
      buildAddPoolVoucherCalls({ ...base(), depositCapRaw: "0", pricing: { kind: "decimal" } }),
    ).toThrow(/greater than zero/);
  });

  it("rejects a zero staleness bound rather than encoding one", () => {
    // Zero is the quoter's own sentinel for "fall back to the global bound", and
    // the two-argument overload already says that more plainly.
    expect(() =>
      buildAddPoolVoucherCalls({
        ...base(),
        pricing: {
          kind: "oracle",
          aggregatorAddress: AGGREGATOR,
          maxStalenessSeconds: "0",
        },
      }),
    ).toThrow(/greater than zero/);
  });

  it("rejects a zero address anywhere in the batch", () => {
    expect(() =>
      buildAddPoolVoucherCalls({
        ...base(),
        tokenAddress: "0x0000000000000000000000000000000000000000",
        pricing: { kind: "decimal" },
      }),
    ).toThrow(/voucher must be a non-zero address/);

    expect(() =>
      buildAddPoolVoucherCalls({
        ...base(),
        pricing: {
          kind: "oracle",
          aggregatorAddress: "0x0000000000000000000000000000000000000000",
        },
      }),
    ).toThrow(/aggregator must be a non-zero address/);
  });

  it("refuses a batch that would do nothing", () => {
    expect(() =>
      buildAddPoolVoucherCalls({ ...base(), register: false, pricing: { kind: "decimal" } }),
    ).toThrow(/at least one of registration/);
  });
});

describe("relative pricing", () => {
  it("sets the token's PPM rate on the quoter", () => {
    const calls = buildAddPoolVoucherCalls({
      ...base(),
      register: false,
      pricing: { kind: "relative", exchangeRatePpm: "2500000" },
    });

    expect(calls.map((call) => call.to)).toEqual([QUOTER]);
    expect(
      decodeFunctionData({ abi: relativeQuoterSetPriceIndexValueAbi, data: calls[0]!.data }),
    ).toEqual({ functionName: "setPriceIndexValue", args: [TOKEN, 2500000n] });
  });

  it("rejects a zero rate, which the quoter would read back as parity", () => {
    expect(() =>
      buildAddPoolVoucherCalls({
        ...base(),
        pricing: { kind: "relative", exchangeRatePpm: "0" },
      }),
    ).toThrow(/greater than zero/);
  });

  it("leaves the quoter alone when no pricing is given", () => {
    // An edit that only moves the cap must not re-sign the rate: the steward did
    // not choose a new one, and writing the old one back races anyone who did.
    const calls = buildAddPoolVoucherCalls({
      ...base(),
      register: false,
      depositCapRaw: "1000000",
    });

    expect(calls.map((call) => call.to)).toEqual([LIMITER]);
  });
});

describe("buildRemovePoolVoucherCalls", () => {
  it("deregisters the token and touches nothing else", () => {
    const calls = buildRemovePoolVoucherCalls({
      tokenAddress: TOKEN,
      registryAddress: REGISTRY,
    });

    expect(calls.map((call) => call.to)).toEqual([REGISTRY]);
    expect(decodeFunctionData({ abi: tokenIndexRemoveAbi, data: calls[0]!.data })).toEqual({
      functionName: "remove",
      args: [TOKEN],
    });
  });

  it("refuses a pool with no registry on record", () => {
    expect(() =>
      buildRemovePoolVoucherCalls({ tokenAddress: TOKEN, registryAddress: null }),
    ).toThrow(/no token registry address/);
  });
});

describe("buildWithdrawPoolLiquidityCalls", () => {
  it("sends the named amount to the named recipient", () => {
    const calls = buildWithdrawPoolLiquidityCalls({
      poolAddress: POOL,
      tokenAddress: TOKEN,
      recipientAddress: RECIPIENT,
      amountRaw: "750000",
    });

    expect(calls.map((call) => call.to)).toEqual([POOL]);
    expect(decodeFunctionData({ abi: swapPoolWithdrawLiquidityAbi, data: calls[0]!.data })).toEqual(
      { functionName: "withdrawLiquidity", args: [TOKEN, RECIPIENT, 750000n] },
    );
  });

  it("rejects the zero recipient, which SwapPool reverts on", () => {
    expect(() =>
      buildWithdrawPoolLiquidityCalls({
        poolAddress: POOL,
        tokenAddress: TOKEN,
        recipientAddress: "0x0000000000000000000000000000000000000000",
        amountRaw: "1",
      }),
    ).toThrow(/recipient must be a non-zero address/);
  });
});

describe("buildSetPoolFeeAddressCalls", () => {
  it("re-points the pool's fee recipient", () => {
    const calls = buildSetPoolFeeAddressCalls({ poolAddress: POOL, feeAddress: RECIPIENT });

    expect(calls.map((call) => call.to)).toEqual([POOL]);
    expect(decodeFunctionData({ abi: swapPoolSetFeeAddressAbi, data: calls[0]!.data })).toEqual({
      functionName: "setFeeAddress",
      args: [RECIPIENT],
    });
  });

  it("rejects the zero address, which would make accrued fees uncollectible", () => {
    expect(() =>
      buildSetPoolFeeAddressCalls({
        poolAddress: POOL,
        feeAddress: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrow(/fee recipient must be a non-zero address/);
  });
});

describe("cap and unit value conversion", () => {
  it("converts a value in the pool's unit into a cap in token units", () => {
    // 1 token is worth 2.5 units, so 500 units of headroom is 200 tokens.
    expect(poolVoucherCapFromUnitValue("500000000", "2500000", 6)).toBe("200000000");
  });

  it("round-trips a cap back into the unit it was named in", () => {
    expect(poolVoucherUnitValueFromCap("200000000", "2500000", 6)).toBe("500000000");
  });

  it("floors rather than rounds up, so a cap never admits more than was named", () => {
    // 1 unit at a rate of 3 is 0.333333… tokens; the last base unit is dropped.
    expect(poolVoucherCapFromUnitValue("1000000", "3000000", 6)).toBe("333333");
  });

  it("crosses decimals without losing the rate", () => {
    expect(poolVoucherCapFromUnitValue("500000000", "2500000", 18)).toBe("200000000000000000000");
  });

  it("refuses a zero rate rather than dividing by it", () => {
    expect(() => poolVoucherCapFromUnitValue("1000000", "0", 6)).toThrow(/greater than zero/);
  });
});

describe("poolVoucherRateSchema", () => {
  it("requires a positive rate", () => {
    const schema = poolVoucherRateSchema({ requireCreditLimit: true });
    expect(schema.safeParse({ exchangeRate: "0", creditLimit: "100" }).success).toBe(false);
    expect(schema.safeParse({ exchangeRate: "2.5", creditLimit: "100" }).success).toBe(true);
  });

  it("caps a rate at the quoter's six places", () => {
    const schema = poolVoucherRateSchema({ requireCreditLimit: false });
    expect(schema.safeParse({ exchangeRate: "1.1234567", creditLimit: "" }).success).toBe(false);
    expect(schema.safeParse({ exchangeRate: "1.123456", creditLimit: "" }).success).toBe(true);
  });

  it("leaves the credit limit optional for a pool with no limiter", () => {
    // Nothing on chain would reject the deposit, so there is no cap to write.
    const schema = poolVoucherRateSchema({ requireCreditLimit: false });
    expect(schema.safeParse({ exchangeRate: "1", creditLimit: "" }).success).toBe(true);
  });
});

describe("toPoolVoucherRateConfig", () => {
  it("scales the rate to PPM and the limit into token base units", () => {
    expect(
      toPoolVoucherRateConfig({
        values: { exchangeRate: "2.5", creditLimit: "500" },
        decimals: 6,
        hasLimiter: true,
      }),
    ).toEqual({
      pricing: { kind: "relative", exchangeRatePpm: "2500000" },
      depositCapRaw: "200000000",
    });
  });

  it("omits the cap entirely when the pool has no limiter", () => {
    expect(
      toPoolVoucherRateConfig({
        values: { exchangeRate: "2.5", creditLimit: "" },
        decimals: 6,
        hasLimiter: false,
      }),
    ).toEqual({ pricing: { kind: "relative", exchangeRatePpm: "2500000" } });
  });
});

describe("seedPoolVoucherRateInput", () => {
  it("round-trips a configured voucher back into its fields", () => {
    expect(
      seedPoolVoucherRateInput({
        exchangeRatePpm: "2500000",
        capRaw: "200000000",
        decimals: 6,
      }),
    ).toEqual({ exchangeRate: "2.5", creditLimit: "500" });
  });

  it("leaves the limit blank when the pool has never capped the voucher", () => {
    expect(
      seedPoolVoucherRateInput({ exchangeRatePpm: "1000000", capRaw: null, decimals: 6 }),
    ).toEqual({ exchangeRate: "1", creditLimit: "" });
  });
});
