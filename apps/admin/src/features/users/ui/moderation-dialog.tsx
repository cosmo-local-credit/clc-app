import { useState } from "react";

import { ConfirmDialog } from "#/components/admin/confirm-dialog";
import { ReasonField } from "#/components/admin/reason-field";

/**
 * Ban or unban, with the optional reason the history keeps.
 *
 * The reason lives here and not in the header, so closing the dialog drops it:
 * a note typed for one account must never ride along on the next confirmation.
 */
export function ModerationDialog({
  action,
  pending,
  onConfirm,
  onCancel,
}: {
  action: "ban" | "unban";
  pending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const ban = action === "ban";

  return (
    <ConfirmDialog
      open
      title={ban ? "Ban this user?" : "Unban this user?"}
      description={
        ban
          ? "This account loses access until it is unbanned. Its retirement, if any, is not changed."
          : "This account regains access. Its retirement, if any, is not changed."
      }
      confirmLabel={ban ? "Ban user" : "Unban user"}
      destructive={ban}
      pending={pending}
      onCancel={onCancel}
      onConfirm={() => onConfirm(reason)}
    >
      <ReasonField id="moderation-reason" value={reason} onChange={setReason} disabled={pending} />
    </ConfirmDialog>
  );
}
