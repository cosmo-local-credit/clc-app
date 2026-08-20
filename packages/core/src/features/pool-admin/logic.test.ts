import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vite-plus/test";

import {
  buildAddPoolVoucherCalls,
  limiterSetLimitForAbi,
  oracleQuoterSetOracleAbi,
  oracleQuoterSetOracleWithStalenessAbi,
  tokenIndexAddAbi,
} from "./logic";

const POOL = "0x8e0a000000000000000000000000000000000b41" as const;
const TOKEN = "0x3aa7000000000000000000000000000000000102" as const;
const REGISTRY = "0x61a8000000000000000000000000000000007001" as const;
const LIMITER = "0x4d90000000000000000000000000000000000a1c" as const;
const QUOTER = "0xb91c000000000000000000000000000000007d20" as const;
const AGGREGATOR = "0x0826000000000000000000000000000000005e9d" as const;

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
