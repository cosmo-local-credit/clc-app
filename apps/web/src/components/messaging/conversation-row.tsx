import type { Conversation } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiImageLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { UnreadCount, UnreadCountLabel } from "#/components/ui/unread-count";
import { cn } from "#/lib/utils";
import { PeerAvatar, PeerName } from "./peer";

/** One conversation in Messages or Helpdesk; opens its thread. */
export function ConversationRow({
  conversation,
  isLast,
}: {
  conversation: Conversation;
  isLast: boolean;
}) {
  const { i18n } = useLingui();
  const last = conversation.lastMessage;
  const at = conversation.lastMessageAt ?? conversation.updatedAt;
  const incomingRequest = conversation.status === "pending" && conversation.canAccept;
  return (
    <Link
      to="/messages/$conversationId"
      params={{ conversationId: String(conversation.id) }}
      className={cn(
        "flex w-full items-center gap-2.5 p-3 text-start",
        !isLast && "border-border border-b",
      )}
    >
      <PeerAvatar peer={conversation.peer} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 font-semibold text-sm">
          <PeerName peer={conversation.peer} className="truncate" />
          {incomingRequest ? (
            <Badge size="sm" caps>
              <Trans>Request</Trans>
            </Badge>
          ) : null}
          {conversation.status === "pending" && conversation.requestedBySelf ? (
            <Badge size="sm" caps variant="outline">
              <Trans>Pending</Trans>
            </Badge>
          ) : null}
          <UnreadCountLabel count={conversation.unreadCount} />
        </p>
        <p className="truncate text-muted-foreground text-xs" dir="auto">
          {last ? (
            last.body ? (
              last.body
            ) : (
              <span className="inline-flex items-center gap-1">
                <RiImageLine className="size-3.5" aria-hidden="true" />
                <Trans>Photo</Trans>
              </span>
            )
          ) : (
            (conversation.intro ?? "")
          )}
        </p>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <time dateTime={at} className="font-mono text-2xs text-muted-foreground">
          {i18n.date(new Date(at), { dateStyle: "short" })}
        </time>
        <UnreadCount count={conversation.unreadCount} />
      </span>
    </Link>
  );
}
