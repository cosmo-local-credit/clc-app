import { Trans } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import type { SafePendingProposal } from "../hooks/use-safe-pending";

export function SafeExecutionControl({
  proposal,
  className,
  disabled = false,
}: {
  proposal: SafePendingProposal;
  className?: string;
  disabled?: boolean;
}) {
  const state = proposal.transaction.executionState;

  if (state === "queued" || state === "submitted" || proposal.action === "executing") {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        {state === "queued" ? <Trans>Queued for execution…</Trans> : <Trans>Executing…</Trans>}
      </p>
    );
  }
  if (state === "waiting") {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        <Trans>Waiting for earlier multisig transactions to execute.</Trans>
      </p>
    );
  }
  if (state === "ready" || state === "failed") {
    return (
      <div className="grid gap-2">
        {state === "failed" ? (
          <p role="alert" className="text-xs text-destructive">
            <Trans>Automatic execution did not complete. You can try again.</Trans>
          </p>
        ) : null}
        <Button
          tap
          className={className}
          pending={proposal.requestingExecution}
          disabled={disabled}
          onClick={proposal.execute}
        >
          {proposal.requestingExecution ? <Trans>Executing…</Trans> : <Trans>Execute</Trans>}
        </Button>
      </div>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      <Trans>Execute it in Safe.</Trans>
    </p>
  );
}
