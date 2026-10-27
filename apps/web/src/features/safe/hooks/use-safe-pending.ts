import type { SafeProposal } from "@clc/api/features/safe/client";
import { safePendingQueryOptions } from "@clc/api/features/safe/queries";
import {
  decodeSafeTransactionCalls,
  safeProposalAction,
  type SafeCall,
  type SafeProposalAction,
} from "@clc/core/features/safe/logic";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { safeClient } from "#/lib/api/safe";
import { SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";
import { useSafeConfirm } from "./use-safe-confirm";

export interface SafePendingProposal {
  transaction: SafeProposal;
  /** Decoded calls; null when the payload cannot be decoded. */
  calls: readonly SafeCall[] | null;
  action: SafeProposalAction;
  /** This proposal's confirmation is being signed. */
  confirming: boolean;
  confirm: () => void;
}

/**
 * Queued proposals of one Safe and what the viewer may do with each. A signer
 * with a key the Safe accepts confirms; execution and rejection stay in Safe.
 */
export function useSafePending(safe: `0x${string}`) {
  const query = useQuery(safePendingQueryOptions(safeClient, safe));
  const auth = useAuthStatus();
  const { address, connector } = useConnection();
  const viewer = auth.isAuthenticated
    ? (auth.session?.address as `0x${string}` | undefined)
    : undefined;
  const isSigner = useSafeOwnersSignedBy([safe], viewer).has(safe.toLowerCase());
  // A passkey cannot produce a signature the Safe accepts, and the connected
  // wallet must be the session's, or the backend would refuse the signature.
  const canSign =
    isSigner &&
    connector?.id !== CALIBUR_WEBAUTHN_CONNECTOR_ID &&
    !!address &&
    address.toLowerCase() === viewer?.toLowerCase();
  const confirm = useSafeConfirm();
  const proposals: SafePendingProposal[] = (query.data ?? []).map((transaction) => {
    const calls = decodeSafeTransactionCalls(transaction, SAFE_MULTISEND_CALL_ONLY);
    return {
      transaction,
      calls,
      action: safeProposalAction({
        confirmations: transaction.confirmations,
        confirmationsRequired: transaction.confirmationsRequired,
        calls,
        viewer,
        canSign,
        executing: transaction.executing,
      }),
      confirming: confirm.isPending && confirm.variables?.safeTxHash === transaction.safeTxHash,
      confirm: () =>
        confirm.mutate(transaction, {
          onError: (error) => {
            toast.error(error.message);
          },
        }),
    };
  });
  return {
    status: query.isPending ? "pending" : query.isError ? "error" : "ready",
    proposals,
    /** Any confirmation is being signed; the others wait for it. */
    confirmBusy: confirm.isPending,
  } as const;
}
