import type { Peer } from "@clc/core/features/messaging/logic";
import { Trans } from "@lingui/react/macro";
import { RiCustomerService2Line } from "react-icons/ri";

import { EllipsizedAddress } from "#/components/wallet/wallet-address";
import { cn } from "#/lib/utils";

/** A peer's avatar, or the initial of their username; Support has its own mark. */
export function PeerAvatar({ peer, className }: { peer: Peer | null; className?: string }) {
  const classes = cn(
    "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted",
    className,
  );
  if (!peer) {
    return (
      <span className={classes} aria-hidden="true">
        <RiCustomerService2Line className="size-4 text-foreground" />
      </span>
    );
  }
  if (peer.avatar) {
    return <img src={peer.avatar} alt="" className={cn(classes, "object-cover")} />;
  }
  return (
    <span className={cn(classes, "font-heading font-semibold text-sm")} aria-hidden="true">
      {(peer.username ?? peer.address.slice(2, 3)).slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A peer's username in mono, or their address when they have none; Support for helpdesk. */
export function PeerName({ peer, className }: { peer: Peer | null; className?: string }) {
  if (!peer) {
    return (
      <span className={className}>
        <Trans>Support</Trans>
      </span>
    );
  }
  if (peer.username) {
    return (
      <span dir="ltr" className={cn("font-mono", className)}>
        {peer.username}
      </span>
    );
  }
  return <EllipsizedAddress address={peer.address} className={className} />;
}
