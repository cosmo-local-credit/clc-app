import { useQuery } from "@tanstack/react-query";
import { isAddress, type Hex } from "viem";
import { getTransactionReceipt } from "viem/actions";
import { useClient } from "wagmi";

import { findPoolSwapSettlement } from "#/features/pools/logic/pool-swap-settlement";

const TRANSACTION_HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

export function usePoolSwapSettlement(input: {
  txHash: string | undefined;
  poolAddress: string | undefined;
  tokenIn?: string;
  tokenOut?: string;
  amountInRaw?: string;
  amountOutRaw?: string;
}) {
  const client = useClient();
  const txHash = input.txHash?.match(TRANSACTION_HASH_PATTERN) ? (input.txHash as Hex) : undefined;
  const poolAddress =
    input.poolAddress && isAddress(input.poolAddress) ? input.poolAddress : undefined;
  const tokenIn = input.tokenIn && isAddress(input.tokenIn) ? input.tokenIn : undefined;
  const tokenOut = input.tokenOut && isAddress(input.tokenOut) ? input.tokenOut : undefined;

  const canLoad = !!client && !!txHash && !!poolAddress;
  const query = useQuery({
    queryKey: [
      "pool-swap-settlement",
      client?.uid ?? "none",
      txHash,
      poolAddress,
      tokenIn,
      tokenOut,
      input.amountInRaw,
      input.amountOutRaw,
    ],
    queryFn: async () => {
      if (!client || !txHash || !poolAddress) {
        throw new Error("Swap fee details are missing required parameters.");
      }
      const receipt = await getTransactionReceipt(client, { hash: txHash });
      const settlement = findPoolSwapSettlement(receipt.logs, {
        poolAddress,
        tokenIn,
        tokenOut,
        amountInRaw: input.amountInRaw,
        amountOutRaw: input.amountOutRaw,
      });
      if (!settlement) throw new Error("Swap fee details are unavailable.");
      return settlement;
    },
    enabled: canLoad,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return { ...query, canLoad };
}
