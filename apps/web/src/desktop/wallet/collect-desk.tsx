import { Trans } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";

import { DesktopPhoneOnly } from "#/desktop/ui/phone-only";

const TOKEN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Collect runs on a phone. The desktop page hands off to it with a link to this
 * same route, keeping the chosen voucher when there is one. A voucher contract
 * address is public; nothing about the wallet or session goes in the link.
 */
export function CollectDesk({ token }: { token?: string }) {
  const router = useRouter();
  const href = router.buildLocation({
    to: "/wallet/collect",
    search: token && TOKEN_ADDRESS.test(token) ? { token } : {},
  }).href;
  return <DesktopPhoneOnly title={<Trans>Collect</Trans>} href={href} />;
}
