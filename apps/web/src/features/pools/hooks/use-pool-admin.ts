import { pollTrackingCompletion } from "@clc/api/features/auth/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";

import { poolFeeSettingsQueryKeys } from "./use-pool-fee-settings";
import { poolRegistryQueryKeys } from "./use-pool-registry";
import { poolSwapTokenQueryKeys } from "./use-pool-swap-tokens";
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
 * The quoter, treasury, registry and fee reads are invalidated alongside the
 * catalog because a repriced voucher changes what `priceIndex` answers, a
 * withdrawal changes what the pool holds, an approval changes what the registry
 * admits, and a fee change moves both `defaultFee` and `feeAddress`. None of
 * those reads goes through clc-core at all.
 *
 * Settlement is watched on the *relayer's* tracker, not clc-core's
 * `/api/v2/otx/track`. The latter answers only for deployments the signed-in
 * user owns, and a Calibur batch is submitted by the relayer's own signer, so it
 * has no row there and the endpoint answers 404 "Record(s) not found" forever.
 */
export function usePoolAdminRelay() {
  const queryClient = useQueryClient();
  const { address, connector } = useConnection();
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
          connectorId: connector?.id,
          calls,
          includeAuthorization: delegationStatus === "not-delegated",
        },
        relayerClient,
      );
      const otx = await pollTrackingCompletion(
        async () => (await relayerClient.trackRelay(trackingId)).result,
        // The relayer hands back a tracking id as soon as it accepts the batch
        // and writes the row from a worker moments later, so the first poll or
        // two legitimately find nothing.
        { pendingWhileNotFound: true },
      );
      return { trackingId, txHash: otx.txHash };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: poolKeys.all }),
        queryClient.invalidateQueries({ queryKey: poolQuoterQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: poolTreasuryQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: poolRegistryQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: poolFeeSettingsQueryKeys.all }),
        // The same batch writes the limiter, and the swap screen reads that cap
        // to decide whether a voucher can still be deposited.
        queryClient.invalidateQueries({ queryKey: poolSwapTokenQueryKeys.all }),
      ]);
    },
  });
}
