import { isSafeMonthlyQuotaError } from "@clc/api/features/safe/queries";
import { safeAppQueueUrl } from "@clc/core/features/safe/logic";
import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { SAFE_APP_PREFIX } from "#/lib/safe-config";
import {
  SafeDashboardRequiredError,
  SafePendingConflictError,
  SafeProposalError,
  SafeProposalOutcomeUnknownError,
  SafeProposedError,
  safeQueueFailureKind,
} from "../api/safe-transactions";
import { isPasskeyCancellation, SafePasskeyUnsupportedError } from "../api/sign-safe-transaction";
import { useSafeSheet } from "../state/safe-sheet";
import { useSafeQuotaMessage } from "./use-safe-quota-message";

/**
 * Reports a failed asset write. A Safe transaction that was proposed but still
 * needs signatures is not a failure: it says so and opens the pending sheet,
 * where the other signers' progress is shown.
 *
 * Returns true when the write moved to the multisig sheet, so the caller closes
 * its own form rather than leaving it open behind that sheet.
 */
export function useReportWriteError() {
  const { t } = useLingui();
  const quotaMessage = useSafeQuotaMessage();
  return (error: unknown, fallback: string): boolean => {
    if (error instanceof SafeProposedError) {
      useSafeSheet.getState().show(error.proposal.safe as `0x${string}`);
      toast.info(t`Proposal queued. Confirm and execute it in Safe.`);
      return true;
    }
    if (error instanceof SafeProposalError) {
      if (isSafeMonthlyQuotaError(error.cause)) {
        const { retryAfterMs } = error.cause;
        const queueUrl = SAFE_APP_PREFIX ? safeAppQueueUrl(SAFE_APP_PREFIX, error.safe) : undefined;
        toast.error(
          quotaMessage(retryAfterMs === undefined ? undefined : Date.now() + retryAfterMs),
          {
            action: queueUrl
              ? {
                  label: t`Open in Safe`,
                  onClick: () => window.open(queueUrl, "_blank", "noopener,noreferrer"),
                }
              : undefined,
          },
        );
        return false;
      }
      const kind = safeQueueFailureKind(error.cause);
      if (kind === "session") {
        toast.error(t`Sign in with a signer of this multisig to continue.`);
      } else if (kind === "signer") {
        toast.error(t`Only signers of this multisig can submit proposals.`);
      } else if (error.stage === "check") {
        toast.error(t`Couldn't check the multisig queue. Try again.`);
      } else {
        toast.error(t`The multisig proposal was rejected.`);
      }
      return false;
    }
    if (error instanceof SafeProposalOutcomeUnknownError) {
      useSafeSheet.getState().show(error.safe);
      toast.error(
        t`Couldn't verify whether the proposal was queued. Check Safe before submitting again.`,
      );
      return true;
    }
    if (error instanceof SafeDashboardRequiredError) {
      useSafeSheet.getState().show(error.safe);
      toast.info(
        t`Create this transaction in your multisig wallet. Metadata edits are still available here.`,
      );
      return true;
    }
    if (error instanceof SafePasskeyUnsupportedError) {
      toast.error(t`Passkeys can sign for multisigs on Safe 1.5 or later. Use your sign-in card.`);
      return false;
    }
    if (isPasskeyCancellation(error)) return false;
    if (error instanceof SafePendingConflictError) {
      useSafeSheet.getState().show(error.safe);
      toast.error(t`This multisig already has a transaction waiting for signatures.`);
      return true;
    }
    toast.error(error instanceof Error ? error.message : fallback);
    return false;
  };
}
