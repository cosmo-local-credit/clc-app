import { Trans } from "@lingui/react/macro";

import { DesktopPhoneOnly } from "#/desktop/ui/phone-only";

export function CollectDesk() {
  return <DesktopPhoneOnly title={<Trans>Collect</Trans>} />;
}
