import type { SafeProposal } from "@clc/api/features/safe/client";
import { safePendingQueryOptions } from "@clc/api/features/safe/queries";
import {
  decodeSafeTransactionCalls,
  safeProposalAction,
  safeSupportsContractSignatures,
  type SafeCall,
  type SafeProposalAction,
} from "@clc/core/features/safe/logic";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useClient, useConnection } from "wagmi";
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import { SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";
import { safeVersionQueryOptions } from "../api/sign-safe-transaction";
import { useReportWriteError } from "./use-report-write-error";
import { useSafeConfirm } from "./use-safe-confirm";
import { useRefreshSafeSigners } from "./use-safe-signers";

export interface SafePendingProposal {
  transaction: SafeProposal;
  /** Decoded calls; null when the payload cannot be decoded. */
  calls: readonly SafeCall[] | null;
  action: SafeProposalAction;
  /** This proposal's confirmation is being signed. */
  confirming: boolean;
  confirm: () => void;
  /** The viewer signs with a passkey, which this Safe's version does not accept. */
  passkeyUnsupported: boolean;
}

/**
 * Queued proposals of one Safe and what the viewer may do with each. A signer
 * with a key the Safe accepts confirms; execution and rejection stay in Safe.
 */
export function useSafePending(safe: `0x${string}`) {
  const { t } = useLingui();
  const query = useQuery(safePendingQueryOptions(safeClient, safe));
  const refreshSigners = useRefreshSafeSigners();
  const queued = useRef<ReadonlySet<string> | null>(null);
  // A transaction leaving the queue executed, or another took its nonce. An
  // executed signer change moves who signs, so what depends on that is re-read.
  useEffect(() => {
    if (!query.data) return;
    const current = new Set(query.data.map((transaction) => transaction.safeTxHash));
    const previous = queued.current;
    queued.current = current;
    if (previous && [...previous].some((hash) => !current.has(hash))) void refreshSigners(safe);
  }, [query.data, refreshSigners, safe]);
  const auth = useAuthStatus();
  const { address, connector } = useConnection();
  const viewer = auth.isAuthenticated
    ? (auth.session?.address as `0x${string}` | undefined)
    : undefined;
  const isSigner = useSafeOwnersSignedBy([safe], viewer).has(safe.toLowerCase());
  // A passkey signs as a contract, which a Safe verifies only from 1.5.0 on.
  const isPasskey = connector?.id === CALIBUR_WEBAUTHN_CONNECTOR_ID;
  const chain = useClient({ chainId: CHAIN_ID });
  const version = useQuery(safeVersionQueryOptions(chain, safe, isSigner && isPasskey));
  const passkeyCanSign =
    version.isSuccess && safeSupportsContractSignatures(version.data ?? undefined);
  // The connected wallet must be the session's, or the backend would refuse
  // the signature.
  const canSign =
    isSigner &&
    (!isPasskey || passkeyCanSign) &&
    !!address &&
    address.toLowerCase() === viewer?.toLowerCase();
  const passkeyUnsupported = isSigner && isPasskey && version.isSuccess && !passkeyCanSign;
  const confirm = useSafeConfirm();
  const report = useReportWriteError();
  const proposals: SafePendingProposal[] = (query.data ?? []).map((transaction) => {
    const calls = decodeSafeTransactionCalls(transaction, SAFE_MULTISEND_CALL_ONLY);
    return {
      transaction,
      calls,
      action: safeProposalAction({
        safe,
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
            report(error, t`Failed`);
          },
        }),
      passkeyUnsupported,
    };
  });
  return {
    status: query.isPending ? "pending" : query.isError ? "error" : "ready",
    proposals,
    /** Any confirmation is being signed; the others wait for it. */
    confirmBusy: confirm.isPending,
  } as const;
}
