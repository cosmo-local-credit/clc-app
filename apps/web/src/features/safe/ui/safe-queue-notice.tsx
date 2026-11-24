import { Trans } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import type { useSafePending } from "../hooks/use-safe-pending";

export function SafeQueueNotice({
  status,
  retry,
  retrying,
}: Pick<ReturnType<typeof useSafePending>, "retry" | "retrying"> & {
  status: Exclude<ReturnType<typeof useSafePending>["status"], "pending" | "ready">;
}) {
  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        {status === "session" ? (
          <Trans>Sign in with a signer of this multisig to view proposals.</Trans>
        ) : status === "signer" ? (
          <Trans>Only signers of this multisig can view proposals.</Trans>
        ) : (
          <Trans>Couldn't load multisig proposals.</Trans>
        )}
      </p>
      {status === "temporary" ? (
        <Button variant="outline" tap pending={retrying} onClick={retry}>
          <Trans>Retry</Trans>
        </Button>
      ) : null}
    </div>
  );
}
