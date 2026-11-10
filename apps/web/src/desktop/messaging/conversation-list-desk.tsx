import type { Conversation } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiImageLine } from "react-icons/ri";

import { PeerAvatar, PeerName } from "#/components/messaging/peer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { UnreadCount, UnreadCountLabel } from "#/components/ui/unread-count";
import { NewMessageDialog } from "#/desktop/messaging/new-message-dialog";
import { DESK_SELECTED, DeskEyebrow } from "#/desktop/ui/page";
import { useConversationList } from "#/features/messaging/hooks/use-conversation-list";
import { cn } from "#/lib/utils";

/**
 * The Messages list column: New message, requests waiting on the caller, then
 * every other conversation. Opening one from the inbox pushes history; moving
 * between threads replaces it, so Back always returns to the inbox.
 */
export function ConversationListDesk({ selectedId }: { selectedId?: number }) {
  const { t } = useLingui();
  const list = useConversationList("direct");
  const requests = list.conversations.filter(
    (conversation) => conversation.status === "pending" && conversation.canAccept,
  );
  const others = list.conversations.filter((conversation) => !requests.includes(conversation));
  const replace = selectedId !== undefined;
  return (
    <div className="flex min-h-0 w-[340px] shrink-0 flex-col border-border border-e">
      <div className="shrink-0 border-border border-b p-3">
        <NewMessageDialog existing={list.conversations} />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        aria-busy={list.isPending && list.fetchStatus !== "idle"}
      >
        {list.isPending && list.fetchStatus !== "idle" ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Spinner />
            <Trans>Loading messages…</Trans>
          </p>
        ) : null}
        {list.isError && !list.data ? (
          <div className="grid justify-items-start gap-2 p-4">
            <p role="alert" className="text-sm text-muted-foreground">
              <Trans>Couldn't load messages.</Trans>
            </p>
            <Button variant="outline" pending={list.isFetching} onClick={() => void list.refetch()}>
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {list.isSuccess && list.conversations.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            <Trans>No messages yet.</Trans>
          </p>
        ) : null}
        {requests.length > 0 ? (
          <ConversationGroup label={t`Message requests`} heading={<Trans>Requests</Trans>}>
            {requests.map((conversation) => (
              <ConversationRowDesk
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                replace={replace}
              />
            ))}
          </ConversationGroup>
        ) : null}
        {others.length > 0 ? (
          <ConversationGroup
            label={t`Conversations`}
            heading={requests.length > 0 ? <Trans>Conversations</Trans> : null}
          >
            {others.map((conversation) => (
              <ConversationRowDesk
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                replace={replace}
              />
            ))}
          </ConversationGroup>
        ) : null}
        {list.hasNextPage ? (
          <div className="p-3">
            <Button
              variant="outline"
              className="w-full"
              pending={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              <Trans>Load more</Trans>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConversationGroup({
  label,
  heading,
  children,
}: {
  label: string;
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="border-border border-b">
      {heading ? (
        <div className="px-3.5 pt-3 pb-1">
          <DeskEyebrow>{heading}</DeskEyebrow>
        </div>
      ) : null}
      <ul className="[&>li+li]:border-border [&>li+li]:border-t">{children}</ul>
    </section>
  );
}

/** One conversation in the list column, or the helpdesk row. */
function ConversationRowDesk({
  conversation,
  selected,
  replace = false,
}: {
  conversation: Conversation;
  selected: boolean;
  replace?: boolean;
}) {
  const { i18n } = useLingui();
  const last = conversation.lastMessage;
  const at = conversation.lastMessageAt ?? conversation.updatedAt;
  const incomingRequest = conversation.status === "pending" && conversation.canAccept;
  return (
    <li>
      <Link
        to="/messages/$conversationId"
        params={{ conversationId: String(conversation.id) }}
        replace={replace}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-w-0 items-center gap-3 px-3.5 py-2.5 text-start hover:bg-muted/60",
          selected && DESK_SELECTED,
        )}
      >
        <PeerAvatar peer={conversation.peer} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
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
          </span>
          <span className="block truncate text-xs text-muted-foreground" dir="auto">
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
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <time dateTime={at} className="font-mono text-2xs text-muted-foreground">
            {i18n.date(new Date(at), { dateStyle: "short" })}
          </time>
          <UnreadCount count={conversation.unreadCount} />
        </span>
      </Link>
    </li>
  );
}
