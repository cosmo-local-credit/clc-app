import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { Peer } from "@clc/core/features/messaging/logic";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { initials } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";

export function peerName(peer: Peer): string {
  return peer.username ?? "No username";
}

/**
 * A messaging participant: avatar, username, and the truncated address linking
 * to their account. `name` replaces the plain username, e.g. with a link to the
 * thread, so a row has one link per destination.
 */
export function PeerIdentity({ peer, name }: { peer: Peer; name?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7">
        {peer.avatar ? <AvatarImage src={peer.avatar} alt="" /> : null}
        <AvatarFallback className="font-heading text-xs">
          {initials(peer.username ?? "")}
        </AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name ?? peerName(peer)}</span>
        <Link
          to="/users/$address"
          params={{ address: peer.address }}
          search={{ tab: "transactions", perPage: DEFAULT_PAGE_SIZE }}
          title={peer.address}
          aria-label={`Account ${peer.address}`}
          className="font-data text-muted-foreground w-fit text-xs underline-offset-4 hover:underline"
        >
          {formatVoucherAddress(peer.address as `0x${string}`)}
        </Link>
      </span>
    </span>
  );
}
