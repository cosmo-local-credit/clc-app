import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import {
  SafeDashboardRequiredError,
  SafePendingConflictError,
  SafeProposedError,
} from "../api/safe-transactions";
import { isPasskeyCancellation, SafePasskeyUnsupportedError } from "../api/sign-safe-transaction";
import { useSafeSheet } from "../state/safe-sheet";

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
  return (error: unknown, fallback: string): boolean => {
    if (error instanceof SafeProposedError) {
      useSafeSheet.getState().show(error.proposal.safe as `0x${string}`);
      toast.info(t`Proposal queued. Confirm and execute it in Safe.`);
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
      toast.error(error.message);
      return true;
    }
    toast.error(error instanceof Error ? error.message : fallback);
    return false;
  };
}
