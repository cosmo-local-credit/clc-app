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

export function usePoolSwapTransfer() {
  const { connector } = useConnection();
  return useMutation({
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
