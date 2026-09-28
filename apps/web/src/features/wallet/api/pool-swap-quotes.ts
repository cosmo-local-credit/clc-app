import {
  poolQuoterReverseValueForAbi,
  swapPoolGetAmountInAbi,
  swapPoolGetAmountOutAbi,
  swapPoolGetQuoteAbi,
  swapRouterQuoteExactInputAbi,
  swapRouterQuoteExactOutputAbi,
  type PoolRouteHop,
} from "@clc/core/features/pool-swaps/logic";
import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";

export type PoolQuoteClient = {
  call(this: void, args: { to: Address; data: Hex; blockNumber?: bigint }): Promise<{ data?: Hex }>;
};

type QuoteAtBlock = {
  blockNumber?: bigint;
};

type PoolAmountOutQuoteInput = QuoteAtBlock & {
  poolAddress: Address;
  tokenOut: Address;
  tokenIn: Address;
  amountInRaw: string;
};

type PoolAmountInQuoteInput = QuoteAtBlock & {
  poolAddress: Address;
  tokenOut: Address;
  tokenIn: Address;
  amountOutRaw: string;
};

export type PoolGrossAmountOutQuoteInput = QuoteAtBlock & {
  poolAddress: Address;
  tokenOut: Address;
  tokenIn: Address;
  amountInRaw: string;
};

export type PoolGrossInputCeilingQuoteInput = QuoteAtBlock & {
  poolAddress: Address;
  quoterAddress?: Address;
  tokenOut: Address;
  tokenIn: Address;
  availableAmountOutRaw: string;
  upperAmountInRaw: string;
};

export type RouteExactInputQuoteInput = QuoteAtBlock & {
  routerAddress: Address;
  path: PoolRouteHop[];
  amountInRaw: string;
};

export type RouteExactOutputQuoteInput = QuoteAtBlock & {
  routerAddress: Address;
  path: PoolRouteHop[];
  amountOutRaw: string;
};

export type DeriveExactInputHopAmountInsInput = {
  path: PoolRouteHop[];
  amountInRaw: string;
};

export type DeriveExactOutputHopAmountInsInput = {
  path: PoolRouteHop[];
  amountOutRaw: string;
};

async function quotePoolAmountOut(
  client: PoolQuoteClient,
  input: PoolAmountOutQuoteInput,
): Promise<string> {
  const data = encodeFunctionData({
    abi: swapPoolGetAmountOutAbi,
    functionName: "getAmountOut",
    args: [input.tokenOut, input.tokenIn, parsePositiveAmount(input.amountInRaw)],
  });
  const result = await client.call({
    to: input.poolAddress,
    data,
    blockNumber: input.blockNumber,
  });
  const amountOut = decodeFunctionResult({
    abi: swapPoolGetAmountOutAbi,
    functionName: "getAmountOut",
    data: requireCallData(result.data),
  });
  return amountOut.toString();
}

async function quotePoolAmountIn(
  client: PoolQuoteClient,
  input: PoolAmountInQuoteInput,
): Promise<string> {
  const data = encodeFunctionData({
    abi: swapPoolGetAmountInAbi,
    functionName: "getAmountIn",
    args: [input.tokenOut, input.tokenIn, parsePositiveAmount(input.amountOutRaw)],
  });
  const result = await client.call({
    to: input.poolAddress,
    data,
    blockNumber: input.blockNumber,
  });
  const amountIn = decodeFunctionResult({
    abi: swapPoolGetAmountInAbi,
    functionName: "getAmountIn",
    data: requireCallData(result.data),
  });
  return amountIn.toString();
}

export async function quotePoolGrossAmountOut(
  client: PoolQuoteClient,
  input: PoolGrossAmountOutQuoteInput,
): Promise<string> {
  const data = encodeFunctionData({
    abi: swapPoolGetQuoteAbi,
    functionName: "getQuote",
    args: [input.tokenOut, input.tokenIn, parsePositiveAmount(input.amountInRaw)],
  });
  const result = await client.call({
    to: input.poolAddress,
    data,
    blockNumber: input.blockNumber,
  });
  const grossAmountOut = decodeFunctionResult({
    abi: swapPoolGetQuoteAbi,
    functionName: "getQuote",
    data: requireCallData(result.data),
  });
  return grossAmountOut.toString();
}

/**
 * Largest input at or below `upperAmountInRaw` whose gross pool quote fits the
 * available output liquidity.
 *
 * Pool liquidity is checked before fees are deducted, so the router's
 * exact-output quote (which targets a net amount) cannot answer this question.
 * `reverseValueFor(available + 1) - 1` instead finds the last input before the
 * first unsafe gross output, including integer plateaus caused by decimals and
 * rate rounding. Both sides of that boundary are verified against SwapPool.
 */
export async function quotePoolGrossInputCeiling(
  client: PoolQuoteClient,
  input: PoolGrossInputCeilingQuoteInput,
): Promise<string> {
  const availableAmountOut = parseNonNegativeAmount(input.availableAmountOutRaw);
  const upperAmountIn = parseNonNegativeAmount(input.upperAmountInRaw);
  if (availableAmountOut === 0n || upperAmountIn === 0n) return "0";

  const grossAtUpper = BigInt(
    await quotePoolGrossAmountOut(client, {
      poolAddress: input.poolAddress,
      tokenOut: input.tokenOut,
      tokenIn: input.tokenIn,
      amountInRaw: upperAmountIn.toString(),
      blockNumber: input.blockNumber,
    }),
  );
  if (grossAtUpper <= availableAmountOut) return upperAmountIn.toString();

  const liquidityInputCeiling = input.quoterAddress
    ? await quoteQuoterInputForGrossOutput(client, {
        quoterAddress: input.quoterAddress,
        tokenOut: input.tokenOut,
        tokenIn: input.tokenIn,
        amountOutRaw: (availableAmountOut + 1n).toString(),
        blockNumber: input.blockNumber,
      }).then((firstUnsafeInput) => (firstUnsafeInput > 0n ? firstUnsafeInput - 1n : 0n))
    : availableAmountOut;
  const candidate = liquidityInputCeiling < upperAmountIn ? liquidityInputCeiling : upperAmountIn;

  if (candidate > 0n) {
    const grossAtCandidate = BigInt(
      await quotePoolGrossAmountOut(client, {
        poolAddress: input.poolAddress,
        tokenOut: input.tokenOut,
        tokenIn: input.tokenIn,
        amountInRaw: candidate.toString(),
        blockNumber: input.blockNumber,
      }),
    );
    if (grossAtCandidate > availableAmountOut) {
      throw new Error("Pool quoter returned an unsafe gross input ceiling.");
    }
  }

  if (candidate < upperAmountIn) {
    const grossAfterCandidate = BigInt(
      await quotePoolGrossAmountOut(client, {
        poolAddress: input.poolAddress,
        tokenOut: input.tokenOut,
        tokenIn: input.tokenIn,
        amountInRaw: (candidate + 1n).toString(),
        blockNumber: input.blockNumber,
      }),
    );
    if (grossAfterCandidate <= availableAmountOut) {
      throw new Error("Pool quoter did not return the maximum gross input ceiling.");
    }
  }

  return candidate.toString();
}

export async function quoteRouteExactInput(
  client: PoolQuoteClient,
  input: RouteExactInputQuoteInput,
): Promise<string> {
  const data = encodeFunctionData({
    abi: swapRouterQuoteExactInputAbi,
    functionName: "quoteExactInput",
    args: [toRouterPath(input.path), parsePositiveAmount(input.amountInRaw)],
  });
  const result = await client.call({
    to: input.routerAddress,
    data,
    blockNumber: input.blockNumber,
  });
  const amountOut = decodeFunctionResult({
    abi: swapRouterQuoteExactInputAbi,
    functionName: "quoteExactInput",
    data: requireCallData(result.data),
  });
  return amountOut.toString();
}

export async function quoteRouteExactOutput(
  client: PoolQuoteClient,
  input: RouteExactOutputQuoteInput,
): Promise<string> {
  const data = encodeFunctionData({
    abi: swapRouterQuoteExactOutputAbi,
    functionName: "quoteExactOutput",
    args: [toRouterPath(input.path), parsePositiveAmount(input.amountOutRaw)],
  });
  const result = await client.call({
    to: input.routerAddress,
    data,
    blockNumber: input.blockNumber,
  });
  const amountIn = decodeFunctionResult({
    abi: swapRouterQuoteExactOutputAbi,
    functionName: "quoteExactOutput",
    data: requireCallData(result.data),
  });
  return amountIn.toString();
}

export async function deriveExactInputHopAmountIns(
  client: PoolQuoteClient,
  input: DeriveExactInputHopAmountInsInput,
): Promise<{ hopAmountIns: string[]; finalAmountOutRaw: string }> {
  if (input.path.length === 0) throw new Error("Pool route path must be non-empty.");
  let currentAmountIn = parsePositiveAmount(input.amountInRaw).toString();
  const hopAmountIns: string[] = [];

  for (const hop of input.path) {
    hopAmountIns.push(currentAmountIn);
    currentAmountIn = await quotePoolAmountOut(client, {
      poolAddress: hop.poolAddress,
      tokenOut: hop.tokenOut,
      tokenIn: hop.tokenIn,
      amountInRaw: currentAmountIn,
    });
  }

  return { hopAmountIns, finalAmountOutRaw: currentAmountIn };
}

export async function deriveExactOutputHopAmountIns(
  client: PoolQuoteClient,
  input: DeriveExactOutputHopAmountInsInput,
): Promise<{ hopAmountIns: string[]; totalAmountInRaw: string }> {
  if (input.path.length === 0) throw new Error("Pool route path must be non-empty.");
  let currentAmountOut = parsePositiveAmount(input.amountOutRaw).toString();
  const hopAmountIns = Array.from({ length: input.path.length }, () => "");

  for (let index = input.path.length - 1; index >= 0; index--) {
    const hop = input.path[index];
    if (!hop) throw new Error("Pool route path is missing a hop.");
    const hopAmountIn = await quotePoolAmountIn(client, {
      poolAddress: hop.poolAddress,
      tokenOut: hop.tokenOut,
      tokenIn: hop.tokenIn,
      amountOutRaw: currentAmountOut,
    });
    hopAmountIns[index] = hopAmountIn;
    currentAmountOut = hopAmountIn;
  }

  return { hopAmountIns, totalAmountInRaw: currentAmountOut };
}

function toRouterPath(
  path: PoolRouteHop[],
): { pool: Address; tokenIn: Address; tokenOut: Address }[] {
  if (path.length === 0) throw new Error("Pool route path must be non-empty.");
  return path.map((hop) => ({
    pool: hop.poolAddress,
    tokenIn: hop.tokenIn,
    tokenOut: hop.tokenOut,
  }));
}

function parsePositiveAmount(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Pool amount must be a positive integer string.");
  const amount = BigInt(value);
  if (amount <= 0n) throw new Error("Pool amount must be positive.");
  return amount;
}

function parseNonNegativeAmount(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Pool amount must be a non-negative integer string.");
  return BigInt(value);
}

async function quoteQuoterInputForGrossOutput(
  client: PoolQuoteClient,
  input: QuoteAtBlock & {
    quoterAddress: Address;
    tokenOut: Address;
    tokenIn: Address;
    amountOutRaw: string;
  },
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: poolQuoterReverseValueForAbi,
    functionName: "reverseValueFor",
    args: [input.tokenOut, input.tokenIn, parsePositiveAmount(input.amountOutRaw)],
  });
  const result = await client.call({
    to: input.quoterAddress,
    data,
    blockNumber: input.blockNumber,
  });
  return decodeFunctionResult({
    abi: poolQuoterReverseValueForAbi,
    functionName: "reverseValueFor",
    data: requireCallData(result.data),
  });
}

function requireCallData(data: Hex | undefined): Hex {
  if (!data) throw new Error("Pool quote call returned no data.");
  return data;
}
