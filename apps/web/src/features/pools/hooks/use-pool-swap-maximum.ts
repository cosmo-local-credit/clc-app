import {
  poolSwapInputUpperBoundRaw,
  poolSwapMaxInputRaw,
} from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress, zeroAddress } from "viem";
import { call } from "viem/actions";
import { useClient } from "wagmi";

import {
  SWAP_ROUTER_ADDRESS,
  quotePoolGrossInputCeiling,
  quoteRouteExactInput,
} from "#/features/wallet/api/pool-swap-quotes";

export type PoolSwapMaximum = {
  maxAmountInRaw: string;
  /**
   * What the holder receives for spending `maxAmountInRaw`, after the pool fee and
   * the protocol fee — the router's own `quoteExactInput`, not an estimate. Null
   * where the contract will not quote it (a fee configuration it rejects, or a net
   * of zero); the send ceiling stands regardless.
   */
  maxAmountOutRaw: string | null;
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
 *
 * Fees never reduce what can be sent: `SwapPool` takes the pool fee and the
 * protocol fee out of the output leg, and it checks liquidity against the gross
 * quoted value before either comes off. The ceiling is therefore the wallet
 * balance, the deposit headroom, and the input whose gross quote fits the
 * available output, whichever runs out first. What the fees do change is what
 * arrives, which is why the net receive at that ceiling is quoted alongside it.
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
      const maxAmountOutRaw =
        BigInt(maxAmountInRaw) === 0n
          ? "0"
          : await quoteRouteExactInput(
              { call: (args) => call(client, args) },
              {
                routerAddress: SWAP_ROUTER_ADDRESS,
                path: [{ poolAddress, tokenIn, tokenOut }],
                amountInRaw: maxAmountInRaw,
                blockNumber: input.blockNumber,
              },
            ).catch(() => null);
      return {
        maxAmountInRaw,
        maxAmountOutRaw,
        liquidityInputCeilingRaw,
        blockNumber: input.blockNumber,
      };
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
    // A newer block re-keys the query. Between the two the previous answer for the
    // same pair stands rather than making Max blink out on every refresh; it is
    // only a hint, since Max pins its amount and the swap is re-quoted at the
    // confirming block. A different pair is a different question, so its answer
    // is never lent.
    placeholderData: (previousData, previousQuery) => {
      const previous = previousQuery?.queryKey[1] as
        | { poolAddress: string; tokenIn: string; tokenOut: string }
        | undefined;
      return previous?.poolAddress === (poolAddress ?? "none") &&
        previous.tokenIn === (tokenIn ?? "none") &&
        previous.tokenOut === (tokenOut ?? "none")
        ? previousData
        : undefined;
    },
    retry: false,
    staleTime: 15_000,
  });
}
