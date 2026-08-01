import {
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

function requireCallData(data: Hex | undefined): Hex {
  if (!data) throw new Error("Pool quote call returned no data.");
  return data;
}
