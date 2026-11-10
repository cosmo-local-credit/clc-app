import type { PoolRouteHop } from "@clc/core/features/pool-swaps/logic";
import { useMutation } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import {
  relayPoolSwapExactInput,
  relayPoolSwapExactOutput,
} from "#/features/wallet/api/pool-swap-relay";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";
import type { PoolSwapQuoteMode } from "./use-pool-swap-quote";

const relayerClient = createRelayerClient(RELAYER_URL);

export type PoolSwapTransferInput = {
  mode: PoolSwapQuoteMode;
  senderAddress: `0x${string}`;
  path: PoolRouteHop[];
  hopAmountIns: string[];
  includeAuthorization?: boolean;
};

/**
 * Every pool swap relay, whichever view started it. A swap keeps relaying when
 * a layout switch unmounts the view that confirmed it, so the view that mounts
 * next finds it here (`useIsMutating`) and holds its own Swap back.
 */
export const poolSwapTransferMutationKey = ["pool-swap", "transfer"] as const;

export function usePoolSwapTransfer() {
  const { connector } = useConnection();
  return useMutation({
    mutationKey: poolSwapTransferMutationKey,
    mutationFn: (input: PoolSwapTransferInput) => {
      const relayInput = {
        senderAddress: input.senderAddress,
        connectorId: connector?.id,
        path: input.path,
        hopAmountIns: input.hopAmountIns,
        includeAuthorization: input.includeAuthorization,
      };
      return input.mode === "exact-output"
        ? relayPoolSwapExactOutput(relayInput, relayerClient)
        : relayPoolSwapExactInput(relayInput, relayerClient);
    },
  });
}
