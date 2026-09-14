import { poolKeys } from "@clc/api/features/pools/queries";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { authClient } from "#/lib/api/auth";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";

import { poolTreasuryQueryKeys } from "./use-pool-treasury";
import { poolQuoterQueryKeys } from "./use-pool-quoter";

const relayerClient = createRelayerClient(RELAYER_URL);

/**
 * Signs and relays one batch of pool-owner calls, then waits for the chain.
 *
 * Deliberately call-shaped rather than one hook per operation: every steward
 * action here — approving a voucher, repricing it, removing it, withdrawing
 * liquidity or fees, moving the fee recipient — is the same round trip over a
 * different batch, and the batches are built by the pure builders in
 * `@clc/core/features/pool-admin/logic`. A hook per verb would be five copies of
 * this function.
 *
 * Waiting rather than firing and forgetting, because the screen behind it is
 * what the pool now contains. The relayer returns a tracking id as soon as it
 * accepts the batch, but the registry, the limiter and the quoter have not
 * changed until it lands, and clc-core's indexer only then has anything to
 * serve; invalidating on acceptance would refetch the old state and present it
 * as the new one.
 *
 * The quoter and treasury reads are invalidated alongside the catalog because a
 * repriced voucher changes what `priceIndex` answers and a withdrawal changes
 * what the pool holds, and neither read goes through clc-core at all.
 */
export function usePoolAdminRelay() {
  const queryClient = useQueryClient();
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address as `0x${string}` | undefined);

  return useMutation({
    mutationFn: async (calls: CaliburCall[]) => {
      if (!address) throw new Error("Connect your wallet to manage this pool.");
      if (delegationStatus === "checking") {
        throw new Error("Still checking your wallet. Try again in a moment.");
      }
      const { trackingId } = await relayCaliburBatch(
        {
          senderAddress: address,
          calls,
          includeAuthorization: delegationStatus === "not-delegated",
        },
        relayerClient,
      );
      const otx = await authClient.waitForTrackingCompletion(trackingId);
      return { trackingId, txHash: otx.txHash };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: poolKeys.all }),
        queryClient.invalidateQueries({ queryKey: poolQuoterQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: poolTreasuryQueryKeys.all }),
      ]);
    },
  });
}
