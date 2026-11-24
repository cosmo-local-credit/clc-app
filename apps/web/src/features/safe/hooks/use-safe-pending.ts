import type { SafeProposal } from "@clc/api/features/safe/client";
import { isSafeMonthlyQuotaError, safePendingQueryOptions } from "@clc/api/features/safe/queries";
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
import { safeQueueFailureKind } from "../api/safe-transactions";
import { safeVersionQueryOptions } from "../api/sign-safe-transaction";
import { useReportWriteError } from "./use-report-write-error";
import { useSafeConfirm } from "./use-safe-confirm";
import { useSafeExecute } from "./use-safe-execute";
import { useSafeReject } from "./use-safe-reject";
import { useRefreshAfterSafeExecution } from "./use-refresh-after-safe-execution";
import { useRefreshSafeSigners } from "./use-safe-signers";

export interface SafePendingProposal {
  transaction: SafeProposal;
  /** Decoded calls; null when the payload cannot be decoded. */
  calls: readonly SafeCall[] | null;
  action: SafeProposalAction;
  /** This proposal's confirmation is being signed. */
  confirming: boolean;
  confirm: () => void;
  /** Sponsored execution is being queued or retried for this proposal. */
  requestingExecution: boolean;
  execute: () => void;
  /** A same-nonce Safe rejection is being signed for this action. */
  rejecting: boolean;
  reject: () => void;
  rejection: SafeProposal | null;
  rejectionAction: SafeProposalAction | null;
  requestingRejectionExecution: boolean;
  executeRejection: () => void;
  /** The viewer signs with a passkey, which this Safe's version does not accept. */
  passkeyUnsupported: boolean;
}

/**
 * Queued proposals of one Safe and what the viewer may do with each. A signer
 * with a key the Safe accepts confirms; clc-core sponsors execution and Safe
 * remains available as the external fallback.
 */
export function useSafePending(safe: `0x${string}`) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const viewer = auth.isAuthenticated
    ? (auth.session?.address as `0x${string}` | undefined)
    : undefined;
  const query = useQuery(safePendingQueryOptions(safeClient, safe, viewer));
  const sessionUnavailable = auth.state === "sessionCheckError";
  const status = auth.isLoading
    ? "pending"
    : sessionUnavailable
      ? "temporary"
      : !viewer
        ? "session"
        : query.isError
          ? safeQueueFailureKind(query.error)
          : query.isPending
            ? "pending"
            : "ready";
  const data = status === "ready" ? query.data : undefined;
  const quotaResetAt =
    status === "quota" &&
    isSafeMonthlyQuotaError(query.error) &&
    query.error.retryAfterMs !== undefined
      ? query.errorUpdatedAt + query.error.retryAfterMs
      : undefined;
  const refreshSigners = useRefreshSafeSigners();
  const refreshAfterExecution = useRefreshAfterSafeExecution();
  const queued = useRef<{
    safe: string;
    viewer: string;
    transactions: ReadonlyMap<string, SafeProposal>;
  } | null>(null);
  // A transaction leaving the queue executed, or another took its nonce. An
  // executed signer change moves who signs, and an executed handover or mint
  // moves what the catalog and balances show, so what depends on that is re-read.
  useEffect(() => {
    if (!viewer) {
      queued.current = null;
      return;
    }
    if (!data) return;
    const current = new Map(data.map((transaction) => [transaction.safeTxHash, transaction]));
    const previous = queued.current;
    queued.current = { safe, viewer, transactions: current };
    if (previous?.safe !== safe || previous.viewer !== viewer) return;
    const left = [...previous.transactions.values()].filter((t) => !current.has(t.safeTxHash));
    if (left.length === 0) return;
    void refreshSigners(safe);
    void refreshAfterExecution(left);
  }, [data, refreshAfterExecution, refreshSigners, safe, viewer]);
  const { address, connector } = useConnection();
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
  const execute = useSafeExecute();
  const reject = useSafeReject();
  const report = useReportWriteError();
  const transactions = data ?? [];
  const byHash = new Map(
    transactions.map((transaction) => [transaction.safeTxHash.toLowerCase(), transaction]),
  );
  const proposals: SafePendingProposal[] = transactions
    .filter((transaction) => transaction.transactionKind !== "rejection")
    .map((transaction) => {
      const calls = decodeSafeTransactionCalls(transaction, SAFE_MULTISEND_CALL_ONLY);
      const rejection = transaction.rejectedBySafeTxHash
        ? (byHash.get(transaction.rejectedBySafeTxHash.toLowerCase()) ?? null)
        : null;
      const rejectionCalls = rejection
        ? decodeSafeTransactionCalls(rejection, SAFE_MULTISEND_CALL_ONLY)
        : null;
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
        requestingExecution:
          execute.isPending && execute.variables?.safeTxHash === transaction.safeTxHash,
        execute: () =>
          execute.mutate(transaction, {
            onError: (error) => {
              report(error, t`Execution failed`);
            },
          }),
        rejecting: reject.isPending && reject.variables?.safeTxHash === transaction.safeTxHash,
        reject: () =>
          reject.mutate(transaction, {
            onError: (error) => {
              report(error, t`Rejection failed`);
            },
          }),
        rejection,
        rejectionAction: rejection
          ? safeProposalAction({
              safe,
              confirmations: rejection.confirmations,
              confirmationsRequired: rejection.confirmationsRequired,
              calls: rejectionCalls,
              viewer,
              canSign,
              executing: rejection.executing,
            })
          : null,
        requestingRejectionExecution:
          execute.isPending && execute.variables?.safeTxHash === rejection?.safeTxHash,
        executeRejection: () => {
          if (!rejection) return;
          execute.mutate(rejection, {
            onError: (error) => {
              report(error, t`Execution failed`);
            },
          });
        },
        passkeyUnsupported,
      };
    });
  return {
    status,
    quotaResetAt,
    retry: () => {
      if (sessionUnavailable) auth.retry();
      else if (viewer && (status === "temporary" || status === "quota" || status === "ready"))
        void query.refetch();
    },
    retrying: sessionUnavailable ? auth.retrying : query.isFetching,
    proposals,
    /** Any confirmation is being signed; the others wait for it. */
    confirmBusy: confirm.isPending || execute.isPending || reject.isPending,
  } as const;
}
