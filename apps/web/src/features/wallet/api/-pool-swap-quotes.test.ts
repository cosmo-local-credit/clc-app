import {
  poolQuoterReverseValueForAbi,
  swapPoolGetAmountInAbi,
  swapPoolGetAmountOutAbi,
  swapPoolGetQuoteAbi,
  swapRouterQuoteExactInputAbi,
  swapRouterQuoteExactOutputAbi,
} from "@clc/core/features/pool-swaps/logic";
import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  deriveExactInputHopAmountIns,
  deriveExactOutputHopAmountIns,
  quotePoolGrossInputCeiling,
  quoteRouteExactInput,
  quoteRouteExactOutput,
  type PoolQuoteClient,
} from "./pool-swap-quotes";

const POOL_1 = "0x1111111111111111111111111111111111111111" as const;
const POOL_2 = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_A = "0x3333333333333333333333333333333333333333" as const;
const TOKEN_B = "0x4444444444444444444444444444444444444444" as const;
const TOKEN_C = "0x5555555555555555555555555555555555555555" as const;
const ROUTER = "0x6666666666666666666666666666666666666666" as const;
const QUOTER = "0x7777777777777777777777777777777777777777" as const;

const path = [
  { poolAddress: POOL_1, tokenIn: TOKEN_A, tokenOut: TOKEN_B },
  { poolAddress: POOL_2, tokenIn: TOKEN_B, tokenOut: TOKEN_C },
];

function clientReturning(results: bigint[]): PoolQuoteClient {
  const encoded = results.map((result) =>
    encodeFunctionResult({ abi: swapPoolGetAmountOutAbi, functionName: "getAmountOut", result }),
  );
  return {
    call: vi.fn().mockImplementation(async () => ({ data: encoded.shift() as Hex })),
  };
}

describe("pool swap quote helpers", () => {
  it("derives exact-input hop inputs by walking the route forward", async () => {
    const client = clientReturning([90n, 81n]);

    const result = await deriveExactInputHopAmountIns(client, { path, amountInRaw: "100" });

    expect(result).toEqual({ hopAmountIns: ["100", "90"], finalAmountOutRaw: "81" });
    const calls = vi.mocked(client.call).mock.calls;
    expect(
      decodeFunctionData({ abi: swapPoolGetAmountOutAbi, data: calls[0][0].data }).args,
    ).toEqual([TOKEN_B, TOKEN_A, 100n]);
    expect(
      decodeFunctionData({ abi: swapPoolGetAmountOutAbi, data: calls[1][0].data }).args,
    ).toEqual([TOKEN_C, TOKEN_B, 90n]);
  });

  it("derives exact-output hop inputs by walking the route backward", async () => {
    const encoded = [
      encodeFunctionResult({
        abi: swapPoolGetAmountInAbi,
        functionName: "getAmountIn",
        result: 90n,
      }),
      encodeFunctionResult({
        abi: swapPoolGetAmountInAbi,
        functionName: "getAmountIn",
        result: 100n,
      }),
    ];
    const client: PoolQuoteClient = {
      call: vi.fn().mockImplementation(async () => ({ data: encoded.shift() as Hex })),
    };

    const result = await deriveExactOutputHopAmountIns(client, { path, amountOutRaw: "81" });

    expect(result).toEqual({ hopAmountIns: ["100", "90"], totalAmountInRaw: "100" });
    const calls = vi.mocked(client.call).mock.calls;
    expect(
      decodeFunctionData({ abi: swapPoolGetAmountInAbi, data: calls[0][0].data }).args,
    ).toEqual([TOKEN_C, TOKEN_B, 81n]);
    expect(
      decodeFunctionData({ abi: swapPoolGetAmountInAbi, data: calls[1][0].data }).args,
    ).toEqual([TOKEN_B, TOKEN_A, 90n]);
  });

  it("quotes router exact input and output using the router path shape", async () => {
    const exactInputData = encodeFunctionResult({
      abi: swapRouterQuoteExactInputAbi,
      functionName: "quoteExactInput",
      result: 80n,
    });
    const exactOutputData = encodeFunctionResult({
      abi: swapRouterQuoteExactOutputAbi,
      functionName: "quoteExactOutput",
      result: 120n,
    });
    const client: PoolQuoteClient = {
      call: vi
        .fn()
        .mockResolvedValueOnce({ data: exactInputData })
        .mockResolvedValueOnce({ data: exactOutputData }),
    };

    await expect(
      quoteRouteExactInput(client, { routerAddress: ROUTER, path, amountInRaw: "100" }),
    ).resolves.toBe("80");
    await expect(
      quoteRouteExactOutput(client, { routerAddress: ROUTER, path, amountOutRaw: "80" }),
    ).resolves.toBe("120");

    const exactInputCall = vi.mocked(client.call).mock.calls[0][0];
    expect(exactInputCall.to).toBe(ROUTER);
    expect(
      decodeFunctionData({ abi: swapRouterQuoteExactInputAbi, data: exactInputCall.data }).args,
    ).toEqual([
      [
        { pool: POOL_1, tokenIn: TOKEN_A, tokenOut: TOKEN_B },
        { pool: POOL_2, tokenIn: TOKEN_B, tokenOut: TOKEN_C },
      ],
      100n,
    ]);
  });

  it("keeps the holder/cap upper bound when its gross quote fits liquidity", async () => {
    const client: PoolQuoteClient = {
      call: vi.fn().mockResolvedValue({
        data: encodeFunctionResult({
          abi: swapPoolGetQuoteAbi,
          functionName: "getQuote",
          result: 50n,
        }),
      }),
    };

    await expect(
      quotePoolGrossInputCeiling(client, {
        poolAddress: POOL_1,
        quoterAddress: QUOTER,
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        availableAmountOutRaw: "55",
        upperAmountInRaw: "25",
        blockNumber: 100n,
      }),
    ).resolves.toBe("25");

    expect(vi.mocked(client.call).mock.calls[0][0].blockNumber).toBe(100n);
  });

  it("uses the inverse quoter boundary and verifies both sides of its rounding", async () => {
    const responses = [
      encodeFunctionResult({ abi: swapPoolGetQuoteAbi, functionName: "getQuote", result: 2000n }),
      encodeFunctionResult({
        abi: poolQuoterReverseValueForAbi,
        functionName: "reverseValueFor",
        result: 28n,
      }),
      encodeFunctionResult({ abi: swapPoolGetQuoteAbi, functionName: "getQuote", result: 54n }),
      encodeFunctionResult({ abi: swapPoolGetQuoteAbi, functionName: "getQuote", result: 56n }),
    ];
    const client: PoolQuoteClient = {
      call: vi.fn().mockImplementation(async () => ({ data: responses.shift() as Hex })),
    };

    await expect(
      quotePoolGrossInputCeiling(client, {
        poolAddress: POOL_1,
        quoterAddress: QUOTER,
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        availableAmountOutRaw: "55",
        upperAmountInRaw: "1000",
        blockNumber: 100n,
      }),
    ).resolves.toBe("27");

    const calls = vi.mocked(client.call).mock.calls;
    expect(calls.every(([call]) => call.blockNumber === 100n)).toBe(true);
    expect(calls[1][0].to).toBe(QUOTER);
    expect(
      decodeFunctionData({ abi: poolQuoterReverseValueForAbi, data: calls[1][0].data }).args,
    ).toEqual([TOKEN_B, TOKEN_A, 56n]);
  });

  it("uses raw-unit parity for a pool without a quoter", async () => {
    const responses = [100n, 55n, 56n].map((result) =>
      encodeFunctionResult({ abi: swapPoolGetQuoteAbi, functionName: "getQuote", result }),
    );
    const client: PoolQuoteClient = {
      call: vi.fn().mockImplementation(async () => ({ data: responses.shift() as Hex })),
    };

    await expect(
      quotePoolGrossInputCeiling(client, {
        poolAddress: POOL_1,
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        availableAmountOutRaw: "55",
        upperAmountInRaw: "100",
      }),
    ).resolves.toBe("55");
    expect(client.call).toHaveBeenCalledTimes(3);
  });

  it("returns zero without quoting when no output liquidity is available", async () => {
    const client: PoolQuoteClient = { call: vi.fn() };

    await expect(
      quotePoolGrossInputCeiling(client, {
        poolAddress: POOL_1,
        quoterAddress: QUOTER,
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        availableAmountOutRaw: "0",
        upperAmountInRaw: "100",
      }),
    ).resolves.toBe("0");
    expect(client.call).not.toHaveBeenCalled();
  });

  it("rejects an inverse boundary that the pool does not verify", async () => {
    const responses = [
      encodeFunctionResult({ abi: swapPoolGetQuoteAbi, functionName: "getQuote", result: 2000n }),
      encodeFunctionResult({
        abi: poolQuoterReverseValueForAbi,
        functionName: "reverseValueFor",
        result: 28n,
      }),
      encodeFunctionResult({ abi: swapPoolGetQuoteAbi, functionName: "getQuote", result: 56n }),
    ];
    const client: PoolQuoteClient = {
      call: vi.fn().mockImplementation(async () => ({ data: responses.shift() as Hex })),
    };

    await expect(
      quotePoolGrossInputCeiling(client, {
        poolAddress: POOL_1,
        quoterAddress: QUOTER,
        tokenIn: TOKEN_A,
        tokenOut: TOKEN_B,
        availableAmountOutRaw: "55",
        upperAmountInRaw: "1000",
      }),
    ).rejects.toThrow(/unsafe gross input ceiling/i);
  });
});
