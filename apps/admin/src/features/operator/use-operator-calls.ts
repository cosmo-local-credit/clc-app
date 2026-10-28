import { adminKeys } from "@clc/api/features/admin/queries";
import { poolKeys } from "@clc/api/features/pools/queries";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { relayOperatorBatch } from "#/features/auth/relay-batch";
import { clcApi } from "#/lib/api";
import { relayerClient } from "#/lib/relayer-config";

/**
 * Signs one batch with the operator key, relays it, and waits for the chain.
 *
 * Calldata is built by the caller in @clc/core. This hook only carries it.
 */
export function useOperatorCalls() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (calls: CaliburCall[]) => {
      const { trackingId } = await relayOperatorBatch(calls, relayerClient);
      const otx = await clcApi.auth.waitForTrackingCompletion(trackingId);
      return { trackingId, txHash: otx.txHash };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: poolKeys.all });
      await queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}
