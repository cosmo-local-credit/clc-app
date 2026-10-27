import type { SafeProposal } from "@clc/api/features/safe/client";
import { safeKeys } from "@clc/api/features/safe/queries";
import { computeSafeTxHash } from "@clc/core/features/safe/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient, useConnection, useSignTypedData } from "wagmi";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import { signSafeTransaction } from "../api/sign-safe-transaction";

/**
 * Adds the signed-in signer's confirmation to a queued proposal. The digest is
 * recomputed from the proposal's fields before signing, so a transaction whose
 * hash the app cannot reproduce (a Safe before 1.3.0, or altered fields) is
 * never signed blind; clc-core re-checks the signer, policy and signature.
 */
export function useSafeConfirm() {
  const queryClient = useQueryClient();
  const chain = useClient({ chainId: CHAIN_ID });
  const { address, connector } = useConnection();
  const auth = useAuthStatus();
  const { signTypedDataAsync } = useSignTypedData();

  return useMutation({
    mutationFn: async (proposal: SafeProposal) => {
      if (
        !address ||
        !auth.isAuthenticated ||
        auth.session?.address.toLowerCase() !== address.toLowerCase()
      )
        throw new Error("Connect and sign in with a signer of this multisig.");
      const safe = proposal.safe as `0x${string}`;
      if (
        computeSafeTxHash(CHAIN_ID, safe, proposal).toLowerCase() !==
        proposal.safeTxHash.toLowerCase()
      )
        throw new Error("This transaction can only be confirmed in Safe.");
      const signature = await signSafeTransaction({
        connectorId: connector?.id,
        safeAddress: safe,
        tx: proposal,
        sign: (typed) => signTypedDataAsync(typed),
        owner: address,
        chain,
      });
      return safeClient.confirm({
        safeTxHash: proposal.safeTxHash as `0x${string}`,
        signature,
      });
    },
    // Wait for the refreshed queue so the row changes state as the button settles.
    onSuccess: (_updated, proposal) =>
      queryClient.invalidateQueries({ queryKey: safeKeys.pending(proposal.safe) }),
  });
}
