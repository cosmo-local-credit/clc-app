import { poolKeys } from "@clc/api/features/pools/queries";
import {
  buildAddPoolVoucherCalls,
  type BuildAddPoolVoucherCallsInput,
} from "@clc/core/features/pool-admin/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { relayOperatorBatch } from "#/features/auth/relay-batch";
import { clcApi } from "#/lib/api";
import { relayerClient } from "#/lib/relayer-config";

/**
 * Adds a voucher to a pool: build the calls, sign them with the operator's key,
 * relay them, and wait for the chain.
 *
 * Waiting rather than firing and forgetting, because the whole point of the
 * screen behind it is what the pool now contains. The relayer returns a tracking
 * id as soon as it accepts the batch, but the registry, the limiter and the
 * quoter have not changed until it lands, and clc-core's indexer only then has
 * anything to serve. Invalidating on acceptance would refetch the old state and
 * present it as the new one.
 *
 * Every pool read is invalidated, not just this pool's: the voucher's cap and
 * price also change what the directory and the voucher screens should say, and
 * `poolKeys.all` is the root the key factory hangs everything off for exactly
 * this reason.
 */
export function useAddPoolVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: BuildAddPoolVoucherCallsInput) => {
      const calls = buildAddPoolVoucherCalls(input);
      const { trackingId, signatureType } = await relayOperatorBatch(calls, relayerClient);
      const otx = await clcApi.auth.waitForTrackingCompletion(trackingId);
      return { trackingId, signatureType, txHash: otx.txHash };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: poolKeys.all }),
  });
}
