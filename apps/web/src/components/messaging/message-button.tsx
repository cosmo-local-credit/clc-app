import type { MessageLaunchContext } from "@clc/core/features/messaging/logic";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiMailLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { onboardingSearch } from "#/lib/onboarding-search";

type MessageButtonProps = { className?: string } & (
  | { recipientAddress: string; context?: MessageLaunchContext }
  | { recipientAddress?: never; context: MessageLaunchContext }
);

/** Launch the existing composer; recipient checks and conversation consent stay there. */
export function MessageButton({ recipientAddress, context, className }: MessageButtonProps) {
  const auth = useAuthStatus();
  const search = {
    tab: "activity",
    section: "messages",
    ...(recipientAddress ? { messageTo: recipientAddress } : {}),
    ...(context ? { messageKind: context.kind, messageResource: context.resourceId } : {}),
    ...(context?.kind === "pool" && context.proposedVoucherAddress
      ? { messageVoucher: context.proposedVoucherAddress }
      : {}),
  } as const;
  const label = (
    <>
      <RiMailLine aria-hidden="true" />
      <Trans>Message</Trans>
    </>
  );
  return (
    <Button asChild variant="outline" tap className={className}>
      {auth.state === "guest" || auth.state === "connectedNoSession" ? (
        <Link
          to="/onboarding"
          search={onboardingSearch("signin", `/?${new URLSearchParams(search)}`)}
        >
          {label}
        </Link>
      ) : (
        <Link to="/" search={search}>
          {label}
        </Link>
      )}
    </Button>
  );
}
