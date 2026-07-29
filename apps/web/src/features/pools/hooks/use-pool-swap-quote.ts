import {
  erc20BalanceOfAbi,
  swapPoolFeesAbi,
  swapPoolFeesDecoupledAbi,
} from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmountFixed, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { call, getBlockNumber, multicall } from "viem/actions";
import { useClient } from "wagmi";

import {
  quotePoolGrossAmountOut,
  quoteRouteExactInput,
  quoteRouteExactOutput,
} from "#/features/wallet/api/pool-swap-quotes";

const SWAP_ROUTER_ADDRESS = "0x204653A89FF5F2A935c88b0c750cAcdaA9e7368d" as const;

export type PoolSwapQuoteMode = "exact-input" | "exact-output";

const poolSwapQuoteQueryKeys = {
  all: ["pool-swap-quotes"] as const,
  quote: (input: {
    mode: PoolSwapQuoteMode;
    clientUid: string;
    poolAddress: string | undefined;
    tokenIn: string | undefined;
    tokenOut: string | undefined;
    amountRaw: string | undefined;
  }) => [...poolSwapQuoteQueryKeys.all, input.mode, input] as const,
};

export function usePoolSwapQuote(input: {
  mode: PoolSwapQuoteMode;
  poolAddress: string | undefined;
  tokenIn: string | undefined;
  tokenOut: string | undefined;
  amount: string;
  amountRawOverride?: string;
  tokenInDecimals: number;
  tokenOutDecimals: number;
}) {
  const client = useClient();
  const [debouncedSource, setDebouncedSource] = useState({
    mode: input.mode,
    amount: input.amount,
  });
  const isDebouncing =
    debouncedSource.mode !== input.mode || debouncedSource.amount !== input.amount;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSource({ mode: input.mode, amount: input.amount });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [input.amount, input.mode]);
  const sourceDecimals =
    input.mode === "exact-input" ? input.tokenInDecimals : input.tokenOutDecimals;
  const amountRaw = useMemo(() => {
    if (debouncedSource.mode !== input.mode || debouncedSource.amount !== input.amount) {
      return undefined;
    }
    if (input.mode === "exact-input" && input.amountRawOverride) {
      return /^\d+$/.test(input.amountRawOverride) && BigInt(input.amountRawOverride) > 0n
        ? input.amountRawOverride
        : undefined;
    }
    if (!debouncedSource.amount.trim()) return undefined;
    try {
      const parsed = parseTokenAmount(debouncedSource.amount, sourceDecimals);
      return BigInt(parsed) > 0n ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [debouncedSource, input.amount, input.amountRawOverride, input.mode, sourceDecimals]);
  const poolAddress =
    input.poolAddress && isAddress(input.poolAddress) ? input.poolAddress : undefined;
  const tokenIn = input.tokenIn && isAddress(input.tokenIn) ? input.tokenIn : undefined;
  const tokenOut = input.tokenOut && isAddress(input.tokenOut) ? input.tokenOut : undefined;

  const query = useQuery({
    queryKey: poolSwapQuoteQueryKeys.quote({
      mode: input.mode,
      clientUid: client?.uid ?? "none",
      poolAddress,
      tokenIn,
      tokenOut,
      amountRaw,
    }),
    queryFn: async () => {
      if (!client || !poolAddress || !tokenIn || !tokenOut || !amountRaw) {
        throw new Error("Pool swap quote is missing required parameters.");
      }
      const blockNumber = await getBlockNumber(client);
      const path = [{ poolAddress, tokenIn, tokenOut }];
      const quotedAmountRaw =
        input.mode === "exact-input"
          ? await quoteRouteExactInput(
              { call: (args) => call(client, args) },
              {
                routerAddress: SWAP_ROUTER_ADDRESS,
                path,
                amountInRaw: amountRaw,
                blockNumber,
              },
            )
          : await quoteRouteExactOutput(
              { call: (args) => call(client, args) },
              {
                routerAddress: SWAP_ROUTER_ADDRESS,
                path,
                amountOutRaw: amountRaw,
                blockNumber,
              },
            );
      const amountInRaw = input.mode === "exact-input" ? amountRaw : quotedAmountRaw;
      const amountOutRaw = input.mode === "exact-input" ? quotedAmountRaw : amountRaw;
      const [grossAmountOutRaw, poolState] = await Promise.all([
        quotePoolGrossAmountOut(
          { call: (args) => call(client, args) },
          { poolAddress, tokenIn, tokenOut, amountInRaw, blockNumber },
        ),
        multicall(client, {
          allowFailure: false,
          blockNumber,
          contracts: [
            {
              address: tokenOut,
              abi: erc20BalanceOfAbi,
              functionName: "balanceOf",
              args: [poolAddress],
            },
            {
              address: poolAddress,
              abi: swapPoolFeesDecoupledAbi,
              functionName: "feesDecoupled",
            },
            {
              address: poolAddress,
              abi: swapPoolFeesAbi,
              functionName: "fees",
              args: [tokenOut],
            },
          ],
        }),
      ]);
      const [outputBalanceRaw, feesDecoupled, outputFeesRaw] = poolState;
      const availableAmountOutRaw =
        feesDecoupled && outputBalanceRaw > outputFeesRaw
          ? outputBalanceRaw - outputFeesRaw
          : feesDecoupled
            ? 0n
            : outputBalanceRaw;
      const quotedDecimals =
        input.mode === "exact-input" ? input.tokenOutDecimals : input.tokenInDecimals;
      return {
        amountRaw: quotedAmountRaw,
        amount: formatTokenAmountFixed(quotedAmountRaw, quotedDecimals, 2),
        amountInRaw,
        amountOutRaw,
        grossAmountOutRaw,
        availableAmountOutRaw: availableAmountOutRaw.toString(),
        availableAmountOut: formatTokenAmountFixed(
          availableAmountOutRaw.toString(),
          input.tokenOutDecimals,
          2,
        ),
        hasLiquidity: availableAmountOutRaw >= BigInt(grossAmountOutRaw),
        blockNumber,
      };
    },
    enabled: !!client && !!poolAddress && !!tokenIn && !!tokenOut && !!amountRaw,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === input.mode ? previousData : undefined,
    staleTime: 4_000,
    retry: false,
  });

  return { ...query, isDebouncing };
}
