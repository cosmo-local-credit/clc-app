import { decodeFunctionData, getAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vite-plus/test";

import { swapPoolWithdrawAllFeesAbi } from "../pool-swaps/logic";
import { parseTokenAmount } from "../wallet/logic";

import {
  buildAddPoolVoucherCalls,
  buildRemoveOracleCall,
  buildRemovePairFeeCall,
  buildRemovePoolVoucherCalls,
  buildSealPoolCall,
  buildSetHolderLimitCall,
  buildSetOracleMaxStalenessCall,
  buildSetOracleMultiplierCall,
  buildSetPairFeeCall,
  buildSetPoolFeeCalls,
  buildWithdrawPoolFeesCalls,
  buildWithdrawPoolLiquidityCalls,
  feePolicyPairFeeAbi,
  feePolicySetDefaultFeeAbi,
  findPoolVoucherFeed,
  isOracleFeedStale,
  limiterSetLimitForAbi,
  oracleFeedPrice,
  POOL_VOUCHER_CUSTOM_FEED,
  poolVoucherFeedSchema,
  resolvePoolVoucherFeedAddress,
  seedPoolVoucherFeedInput,
  toPoolVoucherFeedConfig,
  oracleQuoterPolicyAbi,
  oracleQuoterSetOracleAbi,
  oracleQuoterSetOracleWithStalenessAbi,
  poolVoucherCapFromUnitValue,
  poolVoucherRateSchema,
  poolVoucherUnitValueFromCap,
  seedPoolVoucherRateInput,
  toPoolVoucherRateConfig,
  POOL_FEE_PERCENT_DECIMALS,
  relativeQuoterSetPriceIndexValueAbi,
  swapPoolSealAbi,
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
const FEE_POLICY = "0x70c1000000000000000000000000000000003b55" as const;

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

  it("encodes a zero cap, which the limiter takes as accepting no deposits", () => {
    // Zero is a setting, not an omission: a steward may admit a voucher and
    // leave the pool holding none of it until they choose a limit. Only an
    // absent `depositCapRaw` means "don't touch the limiter".
    const [call] = buildAddPoolVoucherCalls({
      ...base(),
      register: false,
      depositCapRaw: "0",
      pricing: { kind: "decimal" },
    });
    expect(call?.to).toBe(LIMITER);
    expect(
      decodeFunctionData({ abi: limiterSetLimitForAbi, data: call?.data as `0x${string}` }).args,
    ).toEqual([TOKEN, POOL, 0n]);
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

  it("refuses to pay the pool itself", () => {
    expect(() =>
      buildWithdrawPoolLiquidityCalls({
        poolAddress: POOL,
        tokenAddress: TOKEN,
        recipientAddress: POOL,
        amountRaw: "1",
      }),
    ).toThrow(/cannot be the pool itself/);
  });
});

describe("buildWithdrawPoolFeesCalls", () => {
  const FEE_ADDRESS = "0x5ee0000000000000000000000000000000000fee" as const;
  const decodeAll = (calls: { data: `0x${string}` }[]) =>
    calls.map((call) =>
      decodeFunctionData({
        abi: [...swapPoolSetFeeAddressAbi, ...swapPoolWithdrawAllFeesAbi],
        data: call.data,
      }),
    );

  it("collects with the single call when the recipient is the pool's own", () => {
    const calls = buildWithdrawPoolFeesCalls({
      poolAddress: POOL,
      tokenAddress: TOKEN,
      recipientAddress: getAddress(FEE_ADDRESS),
      currentFeeAddress: getAddress(FEE_ADDRESS),
    });
    expect(calls.map((call) => call.to)).toEqual([POOL]);
    expect(decodeAll(calls)).toEqual([{ functionName: "withdraw", args: [getAddress(TOKEN)] }]);
  });

  it("points the fee address at another recipient for the collection and restores it", () => {
    const calls = buildWithdrawPoolFeesCalls({
      poolAddress: POOL,
      tokenAddress: TOKEN,
      recipientAddress: RECIPIENT,
      currentFeeAddress: getAddress(FEE_ADDRESS),
    });
    expect(calls.map((call) => call.to)).toEqual([POOL, POOL, POOL]);
    expect(decodeAll(calls)).toEqual([
      { functionName: "setFeeAddress", args: [getAddress(RECIPIENT)] },
      { functionName: "withdraw", args: [getAddress(TOKEN)] },
      { functionName: "setFeeAddress", args: [getAddress(FEE_ADDRESS)] },
    ]);
  });

  it("restores an unset fee address as unset", () => {
    const calls = buildWithdrawPoolFeesCalls({
      poolAddress: POOL,
      tokenAddress: TOKEN,
      recipientAddress: RECIPIENT,
      currentFeeAddress: null,
    });
    expect(decodeAll(calls).at(-1)).toEqual({ functionName: "setFeeAddress", args: [zeroAddress] });
  });

  it("rejects the zero address and the pool as recipients", () => {
    for (const recipientAddress of [zeroAddress, POOL]) {
      expect(() =>
        buildWithdrawPoolFeesCalls({
          poolAddress: POOL,
          tokenAddress: TOKEN,
          recipientAddress,
          currentFeeAddress: null,
        }),
      ).toThrow(/recipient/);
    }
  });
});

describe("buildSetPoolFeeCalls", () => {
  it("batches the rate and the recipient, policy first", () => {
    const calls = buildSetPoolFeeCalls({
      poolAddress: POOL,
      feePolicyAddress: FEE_POLICY,
      feePpm: "15000",
      feeAddress: RECIPIENT,
    });

    expect(calls.map((call) => call.to)).toEqual([FEE_POLICY, POOL]);
    expect(decodeFunctionData({ abi: feePolicySetDefaultFeeAbi, data: calls[0]!.data })).toEqual({
      functionName: "setDefaultFee",
      args: [15_000n],
    });
    expect(decodeFunctionData({ abi: swapPoolSetFeeAddressAbi, data: calls[1]!.data })).toEqual({
      functionName: "setFeeAddress",
      args: [RECIPIENT],
    });
  });

  it("leaves out the contract whose value did not change", () => {
    expect(
      buildSetPoolFeeCalls({
        poolAddress: POOL,
        feePolicyAddress: FEE_POLICY,
        feeAddress: RECIPIENT,
      }).map((call) => call.to),
    ).toEqual([POOL]);

    expect(
      buildSetPoolFeeCalls({
        poolAddress: POOL,
        feePolicyAddress: FEE_POLICY,
        feePpm: "0",
      }).map((call) => call.to),
    ).toEqual([FEE_POLICY]);
  });

  it("takes a zero fee, which is a pool that stops charging", () => {
    expect(
      decodeFunctionData({
        abi: feePolicySetDefaultFeeAbi,
        data: buildSetPoolFeeCalls({
          poolAddress: POOL,
          feePolicyAddress: FEE_POLICY,
          feePpm: "0",
        })[0]!.data,
      }),
    ).toEqual({ functionName: "setDefaultFee", args: [0n] });
  });

  it("refuses a fee above the contract's PPM ceiling", () => {
    expect(() =>
      buildSetPoolFeeCalls({
        poolAddress: POOL,
        feePolicyAddress: FEE_POLICY,
        feePpm: "1000001",
      }),
    ).toThrow(/cannot be more than 100%/);
  });

  it("needs a fee policy address before it can change the rate", () => {
    expect(() =>
      buildSetPoolFeeCalls({ poolAddress: POOL, feePolicyAddress: null, feePpm: "10000" }),
    ).toThrow(/no fee policy address on record/);
  });

  it("rejects the zero address, which would make accrued fees uncollectible", () => {
    expect(() =>
      buildSetPoolFeeCalls({
        poolAddress: POOL,
        feePolicyAddress: FEE_POLICY,
        feeAddress: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrow(/fee recipient must be a non-zero address/);
  });

  it("refuses a batch that would change nothing", () => {
    expect(() => buildSetPoolFeeCalls({ poolAddress: POOL, feePolicyAddress: FEE_POLICY })).toThrow(
      /needs a new rate, a new recipient, or both/,
    );
  });

  it("reads a percentage into PPM at the scale the contract stores", () => {
    expect(parseTokenAmount("1", POOL_FEE_PERCENT_DECIMALS)).toBe("10000");
    expect(parseTokenAmount("0.5", POOL_FEE_PERCENT_DECIMALS)).toBe("5000");
    expect(parseTokenAmount("100", POOL_FEE_PERCENT_DECIMALS)).toBe("1000000");
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

  it("accepts a zero credit limit but not a blank one", () => {
    // The rate and the limit have different rules: the quoter reads a zero rate
    // back as parity, while the limiter stores a zero limit as written.
    const schema = poolVoucherRateSchema({ requireCreditLimit: true });
    expect(schema.safeParse({ exchangeRate: "1", creditLimit: "0" }).success).toBe(true);
    expect(schema.safeParse({ exchangeRate: "1", creditLimit: "" }).success).toBe(false);
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

const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;

describe("buildSealPoolCall", () => {
  it("seals the bits it is given", () => {
    const call = buildSealPoolCall({ poolAddress: POOL, state: 3 });
    expect(call.to).toBe(POOL);
    expect(decodeFunctionData({ abi: swapPoolSealAbi, data: call.data })).toEqual({
      functionName: "seal",
      args: [3],
    });
  });

  it("refuses a state outside 1 to 31", () => {
    expect(() => buildSealPoolCall({ poolAddress: POOL, state: 0 })).toThrow(/1 to 31/);
    expect(() => buildSealPoolCall({ poolAddress: POOL, state: 32 })).toThrow(/1 to 31/);
  });
});

describe("pair fees", () => {
  it("sets a pair fee on the fee policy", () => {
    const call = buildSetPairFeeCall({
      feePolicyAddress: FEE_POLICY,
      tokenIn: TOKEN,
      tokenOut: POOL,
      feePpm: "10000",
    });
    expect(call.to).toBe(FEE_POLICY);
    expect(decodeFunctionData({ abi: feePolicyPairFeeAbi, data: call.data })).toEqual({
      functionName: "setPairFee",
      args: [TOKEN, POOL, 10_000n],
    });
  });

  it("refuses zero, because the contract reads a stored zero as the default", () => {
    expect(() =>
      buildSetPairFeeCall({
        feePolicyAddress: FEE_POLICY,
        tokenIn: TOKEN,
        tokenOut: POOL,
        feePpm: "0",
      }),
    ).toThrow(/Remove the pair fee/);
  });

  it("refuses a pair made from the same token", () => {
    expect(() =>
      buildSetPairFeeCall({
        feePolicyAddress: FEE_POLICY,
        tokenIn: TOKEN,
        tokenOut: TOKEN,
        feePpm: "10000",
      }),
    ).toThrow(/tokens must be different/);
  });

  it("removes a pair fee", () => {
    const call = buildRemovePairFeeCall({
      feePolicyAddress: FEE_POLICY,
      tokenIn: TOKEN,
      tokenOut: POOL,
    });
    expect(decodeFunctionData({ abi: feePolicyPairFeeAbi, data: call.data }).functionName).toBe(
      "removePairFee",
    );
  });
});

describe("oracle policy", () => {
  it("stores a zero staleness bound", () => {
    const call = buildSetOracleMaxStalenessCall({
      quoterAddress: QUOTER,
      maxStalenessSeconds: "0",
    });
    expect(decodeFunctionData({ abi: oracleQuoterPolicyAbi, data: call.data })).toEqual({
      functionName: "setMaxStaleness",
      args: [0n],
    });
  });

  it("keeps the multiplier inside 0.9x to 1x", () => {
    const call = buildSetOracleMultiplierCall({ quoterAddress: QUOTER, multiplierPpm: "900000" });
    expect(decodeFunctionData({ abi: oracleQuoterPolicyAbi, data: call.data }).args).toEqual([
      900_000n,
    ]);
    expect(() =>
      buildSetOracleMultiplierCall({ quoterAddress: QUOTER, multiplierPpm: "899999" }),
    ).toThrow(/0\.9x and 1x/);
  });

  it("removes one token's oracle", () => {
    const call = buildRemoveOracleCall({ quoterAddress: QUOTER, tokenAddress: TOKEN });
    expect(decodeFunctionData({ abi: oracleQuoterPolicyAbi, data: call.data })).toEqual({
      functionName: "removeOracle",
      args: [TOKEN],
    });
  });
});

describe("buildSetHolderLimitCall", () => {
  it("writes a holder cap, including zero", () => {
    const call = buildSetHolderLimitCall({
      limiterAddress: LIMITER,
      tokenAddress: TOKEN,
      holderAddress: HOLDER,
      limitRaw: "0",
    });
    expect(call.to).toBe(LIMITER);
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: call.data })).toEqual({
      functionName: "setLimitFor",
      args: [TOKEN, HOLDER, 0n],
    });
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

  it("keeps a zero limit as a zero cap rather than dropping it", () => {
    expect(
      toPoolVoucherRateConfig({
        values: { exchangeRate: "1", creditLimit: "0" },
        decimals: 6,
        hasLimiter: true,
      }),
    ).toEqual({
      pricing: { kind: "relative", exchangeRatePpm: "1000000" },
      depositCapRaw: "0",
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

  it("reads a recorded zero back as zero, not as an unset field", () => {
    // Blanking it would offer to re-submit some other number in place of a
    // limit the steward chose.
    expect(
      seedPoolVoucherRateInput({ exchangeRatePpm: "1000000", capRaw: "0", decimals: 6 }),
    ).toEqual({ exchangeRate: "1", creditLimit: "0" });
  });
});

const EUR_FEED = getAddress("0xab70bcb260073d036d1660201e9d5405f5829b7a");
const FEEDS = [
  { address: EUR_FEED, maxStalenessSeconds: 93_600 },
  { address: getAddress(AGGREGATOR), maxStalenessSeconds: null },
];

describe("findPoolVoucherFeed", () => {
  it("matches a registry feed whatever casing the address arrives in", () => {
    expect(findPoolVoucherFeed(FEEDS, EUR_FEED.toLowerCase())?.address).toBe(EUR_FEED);
  });

  it("finds nothing for an unregistered, empty or malformed address", () => {
    expect(findPoolVoucherFeed(FEEDS, RECIPIENT)).toBeUndefined();
    expect(findPoolVoucherFeed(FEEDS, null)).toBeUndefined();
    expect(findPoolVoucherFeed(FEEDS, "0x12")).toBeUndefined();
  });
});

describe("poolVoucherFeedSchema", () => {
  const schema = poolVoucherFeedSchema({ requireCreditLimit: true, decimals: 6 });
  const messages = (value: { feed: string; customAddress: string; creditLimit: string }) =>
    schema.safeParse(value).error?.issues.map((issue) => [issue.path[0], issue.message]) ?? [];

  it("requires a feed to be chosen", () => {
    expect(messages({ feed: "", customAddress: "", creditLimit: "10" })).toEqual([
      ["feed", "Choose a price feed"],
    ]);
  });

  it("requires a valid non-zero address for a custom feed", () => {
    expect(
      messages({ feed: POOL_VOUCHER_CUSTOM_FEED, customAddress: zeroAddress, creditLimit: "1" }),
    ).toEqual([["customAddress", "Enter a valid feed address"]]);
    expect(
      messages({ feed: POOL_VOUCHER_CUSTOM_FEED, customAddress: RECIPIENT, creditLimit: "1" }),
    ).toEqual([]);
  });

  it("holds the credit limit to the voucher's own precision", () => {
    expect(messages({ feed: EUR_FEED, customAddress: "", creditLimit: "1.123456" })).toEqual([]);
    expect(messages({ feed: EUR_FEED, customAddress: "", creditLimit: "1.1234567" })).toEqual([
      ["creditLimit", "Enter a credit limit of zero or more"],
    ]);
    expect(messages({ feed: EUR_FEED, customAddress: "", creditLimit: "0" })).toEqual([]);
    expect(messages({ feed: EUR_FEED, customAddress: "", creditLimit: "" })).toEqual([
      ["creditLimit", "Enter a credit limit of zero or more"],
    ]);
  });

  it("skips the limit where the pool has no limiter", () => {
    const uncapped = poolVoucherFeedSchema({ requireCreditLimit: false, decimals: null });
    expect(uncapped.safeParse({ feed: EUR_FEED, customAddress: "", creditLimit: "" }).success).toBe(
      true,
    );
  });
});

describe("toPoolVoucherFeedConfig", () => {
  it("sends a registry feed with its freshness bound and the limit in voucher units", () => {
    expect(
      toPoolVoucherFeedConfig({
        values: { feed: EUR_FEED, customAddress: "", creditLimit: "250.5" },
        feeds: FEEDS,
        decimals: 6,
        hasLimiter: true,
      }),
    ).toEqual({
      pricing: { kind: "oracle", aggregatorAddress: EUR_FEED, maxStalenessSeconds: "93600" },
      depositCapRaw: "250500000",
    });
  });

  it("uses the quoter's global bound for a feed with none, and for a custom address", () => {
    expect(
      toPoolVoucherFeedConfig({
        values: { feed: getAddress(AGGREGATOR), customAddress: "", creditLimit: "" },
        feeds: FEEDS,
        decimals: 6,
        hasLimiter: false,
      }),
    ).toEqual({ pricing: { kind: "oracle", aggregatorAddress: getAddress(AGGREGATOR) } });
    expect(
      toPoolVoucherFeedConfig({
        values: {
          feed: POOL_VOUCHER_CUSTOM_FEED,
          customAddress: ` ${RECIPIENT.toLowerCase()} `,
          creditLimit: "0",
        },
        feeds: FEEDS,
        decimals: 18,
        hasLimiter: true,
      }),
    ).toEqual({
      pricing: { kind: "oracle", aggregatorAddress: getAddress(RECIPIENT) },
      depositCapRaw: "0",
    });
  });

  it("encodes the three-argument setOracle for a registry feed", () => {
    const { pricing } = toPoolVoucherFeedConfig({
      values: { feed: EUR_FEED, customAddress: "", creditLimit: "" },
      feeds: FEEDS,
      decimals: 6,
      hasLimiter: false,
    });
    const [call] = buildAddPoolVoucherCalls({ ...base(), register: false, pricing });
    expect(
      decodeFunctionData({ abi: oracleQuoterSetOracleWithStalenessAbi, data: call?.data ?? "0x" }),
    ).toEqual({ functionName: "setOracle", args: [TOKEN, EUR_FEED, 93_600n] });
  });

  it("refuses fields that name no feed", () => {
    expect(() =>
      toPoolVoucherFeedConfig({
        values: { feed: "", customAddress: "", creditLimit: "1" },
        feeds: FEEDS,
        decimals: 6,
        hasLimiter: true,
      }),
    ).toThrow("Choose a price feed.");
  });
});

describe("seedPoolVoucherFeedInput", () => {
  it("preselects nothing for a voucher without a feed", () => {
    expect(
      seedPoolVoucherFeedInput({
        aggregatorAddress: null,
        feeds: FEEDS,
        capRaw: null,
        decimals: 6,
      }),
    ).toEqual({ feed: "", customAddress: "", creditLimit: "" });
    expect(
      seedPoolVoucherFeedInput({
        aggregatorAddress: zeroAddress,
        feeds: FEEDS,
        capRaw: "0",
        decimals: 6,
      }),
    ).toEqual({ feed: "", customAddress: "", creditLimit: "0" });
  });

  it("seeds a registry feed by its address and the cap in voucher units", () => {
    expect(
      seedPoolVoucherFeedInput({
        aggregatorAddress: EUR_FEED.toLowerCase() as `0x${string}`,
        feeds: FEEDS,
        capRaw: "250500000",
        decimals: 6,
      }),
    ).toEqual({ feed: EUR_FEED, customAddress: "", creditLimit: "250.5" });
  });

  it("seeds an unregistered aggregator as a custom address", () => {
    expect(
      seedPoolVoucherFeedInput({
        aggregatorAddress: RECIPIENT,
        feeds: FEEDS,
        capRaw: "1",
        decimals: 18,
      }),
    ).toEqual({
      feed: POOL_VOUCHER_CUSTOM_FEED,
      customAddress: getAddress(RECIPIENT),
      creditLimit: "0.000000000000000001",
    });
  });

  it("round-trips through the config builder", () => {
    const seed = seedPoolVoucherFeedInput({
      aggregatorAddress: EUR_FEED,
      feeds: FEEDS,
      capRaw: "123456789",
      decimals: 6,
    });
    expect(
      toPoolVoucherFeedConfig({ values: seed, feeds: FEEDS, decimals: 6, hasLimiter: true })
        .depositCapRaw,
    ).toBe("123456789");
    expect(resolvePoolVoucherFeedAddress(seed)).toBe(EUR_FEED);
  });
});

describe("oracle feed reads", () => {
  it("formats an answer at the feed's decimals", () => {
    expect(oracleFeedPrice(110_815_500n, 8)).toBe("1.1081");
    expect(oracleFeedPrice(5n, 0)).toBe("5");
  });

  it("treats a non-positive answer as no price", () => {
    expect(oracleFeedPrice(0n, 8)).toBeNull();
    expect(oracleFeedPrice(-1n, 8)).toBeNull();
  });

  it("applies the feed's own bound, falling back to the quoter default", () => {
    const now = 1_000_000;
    expect(
      isOracleFeedStale({
        updatedAt: BigInt(now - 90_000),
        nowSeconds: now,
        maxStalenessSeconds: 93_600,
      }),
    ).toBe(false);
    expect(
      isOracleFeedStale({
        updatedAt: BigInt(now - 90_000),
        nowSeconds: now,
        maxStalenessSeconds: null,
      }),
    ).toBe(true);
    expect(isOracleFeedStale({ updatedAt: 0n, nowSeconds: now, maxStalenessSeconds: null })).toBe(
      true,
    );
  });
});
