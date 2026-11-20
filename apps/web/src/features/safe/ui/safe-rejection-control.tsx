import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import type { SafePendingProposal } from "../hooks/use-safe-pending";

/** Quorum-based Safe rejection for one pending action. */
export function SafeRejectionControl({
  proposal,
  disabled,
  className,
}: {
  proposal: SafePendingProposal;
  disabled: boolean;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const wasRejecting = useRef(false);
  const { rejection, rejectionAction } = proposal;
  useEffect(() => {
    if (proposal.rejecting) {
      wasRejecting.current = true;
    } else if (wasRejecting.current) {
      wasRejecting.current = false;
      setConfirming(false);
    }
  }, [proposal.rejecting]);

  if (rejectionAction === "execute" || rejectionAction === "executing") {
    return (
      <Button
        type="button"
        variant="destructive"
        tap
        className={className}
        disabled={disabled || rejectionAction === "executing"}
        pending={proposal.requestingRejectionExecution || rejectionAction === "executing"}
        onClick={proposal.executeRejection}
      >
        {rejectionAction === "executing" ? (
          <Trans>Rejecting…</Trans>
        ) : (
          <Trans>Execute rejection</Trans>
        )}
      </Button>
    );
  }

  if (rejectionAction === "confirmed") {
    return (
      <p className="text-xs text-muted-foreground">
        <Trans>You signed the rejection</Trans> ({rejection?.confirmations.length}/
        {rejection?.confirmationsRequired})
      </p>
    );
  }

  if (proposal.passkeyUnsupported || proposal.transaction.executionState === "submitted") {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        tap
        className={className}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {rejection ? <Trans>Sign rejection</Trans> : <Trans>Reject</Trans>}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={<Trans>Reject this multisig action?</Trans>}
        description={
          <Trans>
            This creates a Safe rejection at the same nonce. It needs the same signer quorum and
            will cancel every pending action at this nonce when executed.
          </Trans>
        }
        confirmLabel={rejection ? <Trans>Sign rejection</Trans> : <Trans>Reject</Trans>}
        pendingLabel={<Trans>Signing…</Trans>}
        cancelLabel={<Trans>Cancel</Trans>}
        destructive
        pending={proposal.rejecting}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          proposal.reject();
        }}
      />
    </>
  );
}
