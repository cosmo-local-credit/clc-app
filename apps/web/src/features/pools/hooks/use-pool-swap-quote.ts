import { limiterLimitOfAbi } from "@clc/core/features/pool-admin/logic";
import {
  erc20BalanceOfAbi,
  poolAvailableLiquidityRaw,
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
  SWAP_ROUTER_ADDRESS,
  quotePoolGrossAmountOut,
  quoteRouteExactInput,
  quoteRouteExactOutput,
} from "#/features/wallet/api/pool-swap-quotes";

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
  /**
   * The pool's limiter, when it has one. Present, the quote also answers whether
   * the pool has room left for `tokenIn` — `SwapPool._deposit` reverts
   * `LimitExceeded` on an amount that would put the pool over its cap, and
   * finding that out at relay time costs the holder a signature.
   */
  limiterAddress: string | undefined;
  tokenIn: string | undefined;
  tokenOut: string | undefined;
  amount: string;
  amountRawOverride?: string;
  tokenInDecimals: number;
  tokenOutDecimals: number;
}) {
  const client = useClient();
  const sourceDecimals =
    input.mode === "exact-input" ? input.tokenInDecimals : input.tokenOutDecimals;
  const sourceAmountRaw = useMemo(() => {
    if (input.mode === "exact-input" && input.amountRawOverride) {
      return /^\d+$/.test(input.amountRawOverride) && BigInt(input.amountRawOverride) > 0n
        ? input.amountRawOverride
        : undefined;
    }
    if (!input.amount.trim()) return undefined;
    try {
      const parsed = parseTokenAmount(input.amount, sourceDecimals);
      return BigInt(parsed) > 0n ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [input.amount, input.amountRawOverride, input.mode, sourceDecimals]);
  const [debouncedSource, setDebouncedSource] = useState({
    mode: input.mode,
    amountRaw: sourceAmountRaw,
  });
  const isDebouncing =
    debouncedSource.mode !== input.mode || debouncedSource.amountRaw !== sourceAmountRaw;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSource({ mode: input.mode, amountRaw: sourceAmountRaw });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [input.mode, sourceAmountRaw]);
  // Cosmetic normalization (for example `1` -> `1.00`) represents the same
  // raw amount, so it neither restarts the debounce nor spends another RPC.
  const amountRaw = debouncedSource.mode === input.mode ? debouncedSource.amountRaw : undefined;
  const poolAddress =
    input.poolAddress && isAddress(input.poolAddress) ? input.poolAddress : undefined;
  const tokenIn = input.tokenIn && isAddress(input.tokenIn) ? input.tokenIn : undefined;
  const tokenOut = input.tokenOut && isAddress(input.tokenOut) ? input.tokenOut : undefined;
  const limiterAddress =
    input.limiterAddress && isAddress(input.limiterAddress) ? input.limiterAddress : undefined;

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
      const [grossAmountOutRaw, poolState, depositState] = await Promise.all([
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
        // The deposit half's own two reads, issued alongside the rest at the same
        // pinned block rather than after them, so the cap check adds no latency.
        // `allowFailure` because an unreadable limiter must degrade to "no cap
        // known" rather than take the whole quote down; a pool without one
        // contributes no reads at all, which is what `mustWithinLimit` does with
        // it.
        limiterAddress
          ? multicall(client, {
              allowFailure: true,
              blockNumber,
              contracts: [
                {
                  address: tokenIn,
                  abi: erc20BalanceOfAbi,
                  functionName: "balanceOf",
                  args: [poolAddress],
                },
                {
                  address: limiterAddress,
                  abi: limiterLimitOfAbi,
                  functionName: "limitOf",
                  args: [tokenIn, poolAddress],
                },
              ],
            })
          : undefined,
      ]);
      const [outputBalanceRaw, feesDecoupled, outputFeesRaw] = poolState;
      const availableAmountOutRaw = poolAvailableLiquidityRaw({
        balanceRaw: outputBalanceRaw.toString(),
        feesRaw: outputFeesRaw.toString(),
        feesDecoupled,
      });
      // `mustWithinLimit` is `limitOf(token, pool) >= balanceOf(pool) + value`,
      // so this is the largest input the deposit half of the swap may carry.
      const inputBalance = depositState?.[0];
      const inputLimit = depositState?.[1];
      const depositHeadroomRaw =
        inputBalance?.status !== "success" || inputLimit?.status !== "success"
          ? null
          : (inputLimit.result > inputBalance.result
              ? inputLimit.result - inputBalance.result
              : 0n
            ).toString();
      const quotedDecimals =
        input.mode === "exact-input" ? input.tokenOutDecimals : input.tokenInDecimals;
      return {
        amountRaw: quotedAmountRaw,
        amount: formatTokenAmountFixed(quotedAmountRaw, quotedDecimals, 2),
        amountInRaw,
        amountOutRaw,
        grossAmountOutRaw,
        availableAmountOutRaw,
        availableAmountOut: formatTokenAmountFixed(
          availableAmountOutRaw,
          input.tokenOutDecimals,
          2,
        ),
        hasLiquidity: BigInt(availableAmountOutRaw) >= BigInt(grossAmountOutRaw),
        depositHeadroomRaw,
        depositHeadroom:
          depositHeadroomRaw === null
            ? null
            : formatTokenAmountFixed(depositHeadroomRaw, input.tokenInDecimals, 2),
        exceedsDepositCap:
          depositHeadroomRaw !== null && BigInt(amountInRaw) > BigInt(depositHeadroomRaw),
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
