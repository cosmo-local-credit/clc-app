import { Trans } from "@lingui/react/macro";

import { RotationNotice } from "#/features/key-rotation/ui/rotation-notice";

/** The phone keeps the passkey's old name. The site cannot rename it. */
export function PasskeyRenameNotice() {
  return (
    <RotationNotice>
      <Trans>
        Your passkey still shows the old address. On iPhone, open Settings, then Passwords, and
        rename the passkey for this site. On Android, open Google Password Manager and rename it
        there.
      </Trans>
    </RotationNotice>
  );
}
