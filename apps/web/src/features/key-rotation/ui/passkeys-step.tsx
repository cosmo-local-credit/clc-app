import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

import { PasskeyRenameNotice } from "#/components/passkey-rename-notice";
import { Button } from "#/components/ui/button";

import { useNewCardRelink, useRelinkPasskeys } from "../hooks/use-key-rotation";
import { useRotationSession } from "../state/rotation-session";

/**
 * Registers the passkeys that came along on the new card's wallet. Progress
 * comes from `useNewCardRelink`, so a step remounted by a layout switch picks
 * up a registration the previous one started.
 */
export function PasskeysStep({ onFinished }: { onFinished: (moved: boolean) => void }) {
  const { t } = useLingui();
  const relink = useRelinkPasskeys();
  const latest = useNewCardRelink();
  const pending = latest?.status === "pending";
  const succeeded = latest?.status === "success";

  useEffect(() => {
    if (succeeded) onFinished(true);
  }, [succeeded, onFinished]);

  const run = () => {
    const key = useRotationSession.getState().newKey;
    if (!key) return;
    relink.mutate({ key });
  };
  const failure = latest?.status === "error" ? latest.error : null;
  const error = failure
    ? failure instanceof BackendApiError
      ? formatBackendApiError(failure)
      : failure.message
    : null;

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      <div className="space-y-3">
        <Button tap className="w-full" pending={pending || succeeded} onClick={run}>
          {pending || succeeded ? t`Registering…` : t`Move my passkey`}
        </Button>
        <Button
          variant="outline"
          tap
          className="w-full"
          disabled={pending || succeeded}
          onClick={() => onFinished(false)}
        >
          <Trans>Skip</Trans>
        </Button>
      </div>
    </div>
  );
}

export function DoneStep({ onDone, passkeyMoved }: { onDone: () => void; passkeyMoved: boolean }) {
  return (
    <div className="space-y-6">
      <div className="border border-border bg-card p-4">
        <p className="text-sm">
          <Trans>Your new sign-in card is ready. Your old card no longer signs in.</Trans>
        </p>
      </div>
      {passkeyMoved ? <PasskeyRenameNotice /> : null}
      <Button tap className="w-full" onClick={onDone}>
        <Trans>Done</Trans>
      </Button>
    </div>
  );
}
