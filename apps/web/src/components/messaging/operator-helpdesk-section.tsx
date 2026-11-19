import type { AdminHelpdeskItem, HelpdeskStatus } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { OperatorHelpdeskComposer } from "#/components/messaging/operator-helpdesk-composer";
import { PeerAvatar, PeerName } from "#/components/messaging/peer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import {
  useOperatorHelpdeskQueue,
  useOperatorHelpdeskThread,
} from "#/features/messaging/hooks/use-operator-helpdesk";
import { operatorHelpdeskMessages } from "#/features/messaging/logic/operator-helpdesk";
import { MessageList } from "#/features/messaging/ui/message-list";

export function OperatorHelpdeskSection({
  status,
  conversationId,
}: {
  status: HelpdeskStatus;
  conversationId?: number;
}) {
  return conversationId ? (
    <OperatorHelpdeskThread id={conversationId} status={status} />
  ) : (
    <OperatorHelpdeskQueue status={status} />
  );
}

function OperatorHelpdeskQueue({ status }: { status: HelpdeskStatus }) {
  const { t } = useLingui();
  const query = useOperatorHelpdeskQueue(status);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" aria-label={t`Helpdesk status`}>
        {(["open", "resolved"] as const).map((value) => (
          <Button key={value} asChild variant={status === value ? "default" : "outline"} tap>
            <Link
              to="/"
              search={{
                tab: "activity",
                section: "helpdesk",
                helpdeskStatus: value === "resolved" ? "resolved" : undefined,
              }}
            >
              {value === "open" ? <Trans>Open</Trans> : <Trans>Resolved</Trans>}
            </Link>
          </Button>
        ))}
      </div>
      {query.isPending ? <ListSkeleton label={<Trans>Loading helpdesk…</Trans>} count={4} /> : null}
      {query.isError && !query.data ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p role="alert" className="text-sm">
            <Trans>Couldn't load the helpdesk.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {query.data && items.length === 0 ? (
        <p className="border border-border bg-card p-4 text-muted-foreground text-sm">
          {status === "open" ? (
            <Trans>No open helpdesk conversations.</Trans>
          ) : (
            <Trans>No resolved helpdesk conversations.</Trans>
          )}
        </p>
      ) : null}
      {items.length > 0 ? (
        <section
          className="divide-y divide-border border border-border bg-card"
          aria-label={t`Helpdesk`}
        >
          {items.map((item) => (
            <OperatorHelpdeskRow key={item.id} item={item} status={status} />
          ))}
        </section>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function OperatorHelpdeskRow({
  item,
  status,
}: {
  item: AdminHelpdeskItem;
  status: HelpdeskStatus;
}) {
  const { i18n } = useLingui();
  const last = item.lastMessage;
  return (
    <Link
      to="/"
      search={{
        tab: "activity",
        section: "helpdesk",
        helpdeskId: String(item.id),
        helpdeskStatus: status === "resolved" ? "resolved" : undefined,
      }}
      className="flex items-center gap-3 p-3 text-start"
    >
      <PeerAvatar peer={item.user} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <PeerName peer={item.user} className="truncate" />
          {item.needsReply ? (
            <Badge size="sm" caps>
              <Trans>Needs reply</Trans>
            </Badge>
          ) : null}
        </span>
        <span className="block truncate text-muted-foreground text-xs" dir="auto">
          {last?.body ??
            (last?.imageUrls.length ? <Trans>Photo</Trans> : <Trans>No messages</Trans>)}
        </span>
      </span>
      <time
        dateTime={item.lastMessageAt ?? item.updatedAt}
        className="font-mono text-2xs text-muted-foreground"
      >
        {i18n.date(new Date(item.lastMessageAt ?? item.updatedAt), { dateStyle: "short" })}
      </time>
    </Link>
  );
}

function OperatorHelpdeskThread({ id, status }: { id: number; status: HelpdeskStatus }) {
  const thread = useOperatorHelpdeskThread(id);
  const conversation = thread.item.data;
  const messages = operatorHelpdeskMessages(thread.messages.data?.items ?? []);
  return (
    <div className="space-y-3">
      <Button asChild variant="outline" tap>
        <Link
          to="/"
          search={{
            tab: "activity",
            section: "helpdesk",
            helpdeskStatus: status === "resolved" ? "resolved" : undefined,
          }}
        >
          <Trans>Back to helpdesk</Trans>
        </Link>
      </Button>
      {thread.item.isPending || thread.messages.isPending ? (
        <ListSkeleton label={<Trans>Loading conversation…</Trans>} count={4} />
      ) : null}
      {(thread.item.isError && !conversation) ||
      (thread.messages.isError && !thread.messages.data) ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p role="alert" className="text-sm">
            <Trans>Couldn't load this conversation.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            onClick={() => {
              void thread.item.refetch();
              void thread.messages.refetch();
            }}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {conversation ? (
        <header className="flex items-center gap-3 border border-border bg-card p-3">
          <PeerAvatar peer={conversation.user} />
          <h2 className="min-w-0 flex-1 text-sm font-semibold">
            <PeerName peer={conversation.user} className="truncate" />
          </h2>
          <Badge size="sm" caps variant="outline">
            {conversation.status === "open" ? <Trans>Open</Trans> : <Trans>Resolved</Trans>}
          </Badge>
        </header>
      ) : null}
      {thread.messages.data ? (
        <MessageList
          messages={messages}
          hasOlder={thread.messages.data.hasOlder}
          loadingOlder={thread.loadOlder.isPending}
          onLoadOlder={() => thread.loadOlder.mutate()}
          onNewestOnScreenChange={() => undefined}
        />
      ) : null}
      {conversation ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <OperatorHelpdeskComposer conversationId={id} />
          <Button
            type="button"
            variant="outline"
            tap
            className="w-full"
            pending={thread.setStatus.isPending}
            onClick={() =>
              thread.setStatus.mutate(conversation.status === "open" ? "resolved" : "open")
            }
          >
            {conversation.status === "open" ? (
              <Trans>Resolve conversation</Trans>
            ) : (
              <Trans>Reopen conversation</Trans>
            )}
          </Button>
          {thread.setStatus.isError ? (
            <p role="alert" className="text-destructive text-xs">
              <Trans>That didn't work. Try again.</Trans>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
