import {
  poolSwapInputUpperBoundRaw,
  poolSwapMaxInputRaw,
} from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress, zeroAddress } from "viem";
import { call } from "viem/actions";
import { useClient } from "wagmi";

import { quotePoolGrossInputCeiling } from "#/features/wallet/api/pool-swap-quotes";

export type PoolSwapMaximum = {
  maxAmountInRaw: string;
  liquidityInputCeilingRaw: string;
  blockNumber: bigint;
};

const poolSwapMaximumQueryKeys = {
  all: ["pool-swap-maximum"] as const,
  maximum: (input: {
    clientUid: string;
    poolAddress: string;
    quoterAddress: string | null;
    tokenIn: string;
    tokenOut: string;
    walletBalanceRaw: string;
    depositHeadroomRaw: string | null;
    availableAmountOutRaw: string;
    blockNumber: string;
  }) => [...poolSwapMaximumQueryKeys.all, input] as const,
};

/**
 * Converts the selected output voucher's already-read liquidity into an input
 * ceiling, then combines it with the already-read wallet and deposit bounds.
 * It deliberately performs no balance, fee, or limiter reads of its own.
 */
export function usePoolSwapMaximum(input: {
  poolAddress: string | undefined;
  quoterAddress: string | null | undefined;
  tokenIn: string | undefined;
  tokenOut: string | undefined;
  walletBalanceRaw: string | undefined;
  /** Undefined means a limiter exists but its cap is unknown; null means uncapped. */
  depositHeadroomRaw: string | null | undefined;
  availableAmountOutRaw: string | undefined;
  blockNumber: bigint | undefined;
}) {
  const client = useClient();
  const poolAddress =
    input.poolAddress && isAddress(input.poolAddress) ? input.poolAddress : undefined;
  const tokenIn = input.tokenIn && isAddress(input.tokenIn) ? input.tokenIn : undefined;
  const tokenOut = input.tokenOut && isAddress(input.tokenOut) ? input.tokenOut : undefined;
  const quoterAddress =
    input.quoterAddress &&
    isAddress(input.quoterAddress) &&
    input.quoterAddress.toLowerCase() !== zeroAddress
      ? input.quoterAddress
      : null;
  const quoterKnown =
    input.quoterAddress === null ||
    input.quoterAddress?.toLowerCase() === zeroAddress ||
    quoterAddress !== null;
  const inputUpperBoundRaw =
    input.walletBalanceRaw !== undefined && input.depositHeadroomRaw !== undefined
      ? poolSwapInputUpperBoundRaw({
          walletBalanceRaw: input.walletBalanceRaw,
          depositHeadroomRaw: input.depositHeadroomRaw,
        })
      : null;

  return useQuery({
    queryKey: poolSwapMaximumQueryKeys.maximum({
      clientUid: client?.uid ?? "none",
      poolAddress: poolAddress ?? "none",
      quoterAddress,
      tokenIn: tokenIn ?? "none",
      tokenOut: tokenOut ?? "none",
      walletBalanceRaw: input.walletBalanceRaw ?? "unknown",
      depositHeadroomRaw: input.depositHeadroomRaw ?? null,
      availableAmountOutRaw: input.availableAmountOutRaw ?? "unknown",
      blockNumber: input.blockNumber?.toString() ?? "unknown",
    }),
    queryFn: async (): Promise<PoolSwapMaximum> => {
      if (
        !client ||
        !poolAddress ||
        !tokenIn ||
        !tokenOut ||
        !quoterKnown ||
        input.walletBalanceRaw === undefined ||
        input.depositHeadroomRaw === undefined ||
        input.availableAmountOutRaw === undefined ||
        input.blockNumber === undefined ||
        inputUpperBoundRaw === null
      ) {
        throw new Error("Pool swap maximum is missing required parameters.");
      }
      const liquidityInputCeilingRaw = await quotePoolGrossInputCeiling(
        { call: (args) => call(client, args) },
        {
          poolAddress,
          quoterAddress: quoterAddress ?? undefined,
          tokenIn,
          tokenOut,
          availableAmountOutRaw: input.availableAmountOutRaw,
          upperAmountInRaw: inputUpperBoundRaw,
          blockNumber: input.blockNumber,
        },
      );
      const maxAmountInRaw = poolSwapMaxInputRaw({
        walletBalanceRaw: input.walletBalanceRaw,
        depositHeadroomRaw: input.depositHeadroomRaw,
        liquidityInputCeilingRaw,
      });
      if (maxAmountInRaw === null) {
        throw new Error("Pool swap maximum contains an invalid raw amount.");
      }
      return { maxAmountInRaw, liquidityInputCeilingRaw, blockNumber: input.blockNumber };
    },
    enabled:
      !!client &&
      !!poolAddress &&
      !!tokenIn &&
      !!tokenOut &&
      quoterKnown &&
      input.walletBalanceRaw !== undefined &&
      input.depositHeadroomRaw !== undefined &&
      input.availableAmountOutRaw !== undefined &&
      input.blockNumber !== undefined &&
      inputUpperBoundRaw !== null,
    retry: false,
    staleTime: 15_000,
  });
}
