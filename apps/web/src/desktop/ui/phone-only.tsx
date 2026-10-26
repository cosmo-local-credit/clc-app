import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { DeskCanvas, DeskPanel, DeskTitle } from "#/desktop/ui/page";

/** Web NFC is Chrome on Android. The desktop view says so and leaves the flow on the phone. */
export function DesktopPhoneOnly({ title }: { title: ReactNode }) {
  return (
    <DeskCanvas width="read">
      <DeskTitle>{title}</DeskTitle>
      <DeskPanel className="mt-6">
        <p className="text-sm">
          <Trans>Use a phone to collect with an NFC card.</Trans>
        </p>
      </DeskPanel>
    </DeskCanvas>
  );
}
