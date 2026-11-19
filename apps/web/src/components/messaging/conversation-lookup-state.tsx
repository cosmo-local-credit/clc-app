import { Trans } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

export function ConversationLookupState({
  state,
  onRetry,
}: {
  state: "pending" | "error";
  onRetry: () => void;
}) {
  return state === "pending" ? (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <Spinner />
      <Trans>Checking for a conversation…</Trans>
    </p>
  ) : (
    <div role="alert" className="grid justify-items-start gap-2 text-xs">
      <p className="text-destructive">
        <Trans>Couldn't check for a conversation.</Trans>
      </p>
      <Button type="button" variant="outline" tap onClick={onRetry}>
        <Trans>Retry</Trans>
      </Button>
    </div>
  );
}
