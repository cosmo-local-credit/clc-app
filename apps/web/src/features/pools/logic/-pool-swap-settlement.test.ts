import {
  swapPoolSwapEventAbi,
  swapPoolSwapSettlementEventAbi,
} from "@clc/core/features/pool-swaps/logic";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { describe, expect, it } from "vite-plus/test";

import { findPoolSwapSettlement, type PoolSwapReceiptLog } from "./pool-swap-settlement";

const POOL = "0x1111111111111111111111111111111111111111";
const OTHER_POOL = "0x2222222222222222222222222222222222222222";
const TRADER = "0x3333333333333333333333333333333333333333";
const TOKEN_IN = "0x4444444444444444444444444444444444444444";
const TOKEN_OUT = "0x5555555555555555555555555555555555555555";

function settlementLog(
  overrides: Partial<{
    address: string;
    amountIn: bigint;
    quotedAmountOut: bigint;
    nominalAmountOut: bigint;
    amountOut: bigint;
    poolFee: bigint;
    protocolFee: bigint;
  }> = {},
): PoolSwapReceiptLog {
  const values = {
    address: POOL,
    amountIn: 25_000_000n,
    quotedAmountOut: 50_000_000n,
    nominalAmountOut: 48_900_000n,
    amountOut: 48_900_000n,
    poolFee: 1_000_000n,
    protocolFee: 100_000n,
    ...overrides,
  };
  return {
    address: values.address,
    topics: encodeEventTopics({
      abi: swapPoolSwapSettlementEventAbi,
      eventName: "SwapSettlement",
      args: { initiator: TRADER, tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT },
    }) as readonly Hex[],
    data: encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        values.amountIn,
        values.quotedAmountOut,
        values.nominalAmountOut,
        values.amountOut,
        values.poolFee,
        values.protocolFee,
      ],
    ),
  };
}

function legacyLog(): PoolSwapReceiptLog {
  return {
    address: POOL,
    topics: encodeEventTopics({
      abi: swapPoolSwapEventAbi,
      eventName: "Swap",
      args: { initiator: TRADER, tokenIn: TOKEN_IN },
    }) as readonly Hex[],
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [TOKEN_OUT, 25_000_000n, 48_900_000n, 1_000_000n],
    ),
  };
}

const match = {
  poolAddress: POOL,
  tokenIn: TOKEN_IN,
  tokenOut: TOKEN_OUT,
  amountInRaw: "25000000",
  amountOutRaw: "48900000",
};

describe("findPoolSwapSettlement", () => {
  it("decodes the exact pool and protocol fee from a current settlement", () => {
    expect(findPoolSwapSettlement([settlementLog()], match)).toEqual({
      source: "settlement",
      breakdown: {
        grossAmountOutRaw: "50000000",
        poolFeeRaw: "1000000",
        protocolFeeRaw: "100000",
        totalFeeRaw: "1100000",
      },
    });
  });

  it("prefers the detailed settlement when the transaction also has the legacy event", () => {
    expect(findPoolSwapSettlement([legacyLog(), settlementLog()], match)?.source).toBe(
      "settlement",
    );
  });

  it("supports fee-on-transfer output by matching the nominal or observed output", () => {
    const log = settlementLog({ amountOut: 48_000_000n });
    expect(findPoolSwapSettlement([log], { ...match, amountOutRaw: "48000000" })?.source).toBe(
      "settlement",
    );
  });

  it("returns no result for another pool, inconsistent data, or ambiguous matches", () => {
    expect(findPoolSwapSettlement([settlementLog({ address: OTHER_POOL })], match)).toBeNull();
    expect(findPoolSwapSettlement([settlementLog({ protocolFee: 99_999n })], match)).toBeNull();
    expect(
      findPoolSwapSettlement([legacyLog(), settlementLog({ protocolFee: 99_999n })], match),
    ).toBeNull();
    expect(findPoolSwapSettlement([settlementLog(), settlementLog()], match)).toBeNull();
  });

  it("exposes only the verifiable pool fee for a legacy event", () => {
    expect(findPoolSwapSettlement([legacyLog()], match)).toEqual({
      source: "legacy",
      breakdown: null,
      poolFeeRaw: "1000000",
    });
  });
});
