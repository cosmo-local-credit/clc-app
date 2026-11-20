import type { SafeProposal } from "@clc/api/features/safe/client";
import { safeKeys } from "@clc/api/features/safe/queries";
import { buildSafeRejectionTransaction, computeSafeTxHash } from "@clc/core/features/safe/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient, useConnection, useSignTypedData } from "wagmi";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import { signSafeTransaction } from "../api/sign-safe-transaction";

/** Signs or joins the canonical same-nonce rejection for a pending proposal. */
export function useSafeReject() {
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
      ) {
        throw new Error("Connect and sign in with a signer of this multisig.");
      }
      const safe = proposal.safe as `0x${string}`;
      const tx = buildSafeRejectionTransaction(safe, proposal.nonce);
      const safeTxHash = computeSafeTxHash(CHAIN_ID, safe, tx);
      const signature = await signSafeTransaction({
        connectorId: connector?.id,
        safeAddress: safe,
        tx,
        sign: (typed) => signTypedDataAsync(typed),
        owner: address,
        chain,
      });
      return safeClient.reject(proposal.safeTxHash as `0x${string}`, {
        safeTxHash,
        signature,
        tx,
      });
    },
    onSuccess: (_updated, proposal) =>
      queryClient.invalidateQueries({ queryKey: safeKeys.pending(proposal.safe) }),
  });
}
