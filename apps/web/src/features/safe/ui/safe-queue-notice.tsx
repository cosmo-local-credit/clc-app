import { Trans } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import type { useSafePending } from "../hooks/use-safe-pending";
import { useSafeQuotaMessage } from "../hooks/use-safe-quota-message";

export function SafeQueueNotice({
  status,
  retry,
  retrying,
  quotaResetAt,
}: Pick<ReturnType<typeof useSafePending>, "retry" | "retrying" | "quotaResetAt"> & {
  status: Exclude<ReturnType<typeof useSafePending>["status"], "pending" | "ready">;
}) {
  const quotaMessage = useSafeQuotaMessage();
  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        {status === "session" ? (
          <Trans>Sign in with a signer of this multisig to view proposals.</Trans>
        ) : status === "signer" ? (
          <Trans>Only signers of this multisig can view proposals.</Trans>
        ) : status === "quota" ? (
          quotaMessage(quotaResetAt)
        ) : (
          <Trans>Couldn't load multisig proposals.</Trans>
        )}
      </p>
      {status === "temporary" || status === "quota" ? (
        <Button variant="outline" tap pending={retrying} onClick={retry}>
          <Trans>Retry</Trans>
        </Button>
      ) : null}
    </div>
  );
}

export function SafeQueueRefresh({
  retry,
  retrying,
}: Pick<ReturnType<typeof useSafePending>, "retry" | "retrying">) {
  return (
    <Button variant="outline" tap pending={retrying} onClick={retry}>
      <Trans>Refresh</Trans>
    </Button>
  );
}
