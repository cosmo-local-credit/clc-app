import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import {
  SafeDashboardRequiredError,
  SafePendingConflictError,
  SafeProposedError,
} from "../api/safe-transactions";
import { useSafeSheet } from "../state/safe-sheet";

/**
 * Reports a failed asset write. A Safe transaction that was proposed but still
 * needs signatures is not a failure: it says so and opens the pending sheet,
 * where the other signers' progress is shown.
 */
export function useReportWriteError() {
  const { t } = useLingui();
  return (error: unknown, fallback: string) => {
    if (error instanceof SafeProposedError) {
      useSafeSheet.getState().show(error.proposal.safe as `0x${string}`);
      toast.info(t`Proposal queued. Confirm and execute it in Safe.`);
      return;
    }
    if (error instanceof SafeDashboardRequiredError) {
      useSafeSheet.getState().show(error.safe);
      toast.info(
        t`Create this transaction in your multisig wallet. Metadata edits are still available here.`,
      );
      return;
    }
    if (error instanceof SafePendingConflictError) {
      useSafeSheet.getState().show(error.safe);
    }
    toast.error(error instanceof Error ? error.message : fallback);
  };
}
