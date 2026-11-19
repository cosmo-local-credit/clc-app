import type { AdminHelpdeskItem, HelpdeskStatus } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiCustomerService2Line } from "react-icons/ri";

import { OperatorHelpdeskComposer } from "#/components/messaging/operator-helpdesk-composer";
import { PeerAvatar, PeerName } from "#/components/messaging/peer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { DeskInboxFrame } from "#/desktop/messaging/inbox-frame";
import { MessageScrollerDesk } from "#/desktop/messaging/message-scroller-desk";
import {
  useOperatorHelpdeskQueue,
  useOperatorHelpdeskThread,
} from "#/features/messaging/hooks/use-operator-helpdesk";
import { operatorHelpdeskMessages } from "#/features/messaging/logic/operator-helpdesk";
import { cn } from "#/lib/utils";

export function OperatorHelpdeskDesk({
  header,
  status,
  conversationId,
}: {
  header: ReactNode;
  status: HelpdeskStatus;
  conversationId?: number;
}) {
  return (
    <DeskInboxFrame header={header}>
      <OperatorQueueDesk status={status} selectedId={conversationId} />
      {conversationId ? (
        <OperatorThreadDesk key={conversationId} id={conversationId} />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
          <RiCustomerService2Line className="size-6" aria-hidden="true" />
          <p className="text-sm">
            <Trans>No helpdesk conversation open</Trans>
          </p>
        </div>
      )}
    </DeskInboxFrame>
  );
}

function OperatorQueueDesk({
  status,
  selectedId,
}: {
  status: HelpdeskStatus;
  selectedId?: number;
}) {
  const { t } = useLingui();
  const query = useOperatorHelpdeskQueue(status);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <aside className="flex w-80 shrink-0 flex-col border-border border-e" aria-label={t`Helpdesk`}>
      <div className="grid grid-cols-2 gap-2 border-border border-b p-3">
        {(["open", "resolved"] as const).map((value) => (
          <Button key={value} asChild variant={status === value ? "default" : "outline"}>
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <p className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
            <Spinner />
            <Trans>Loading helpdesk…</Trans>
          </p>
        ) : null}
        {query.isError && !query.data ? (
          <div className="grid justify-items-start gap-2 p-4">
            <p role="alert" className="text-sm">
              <Trans>Couldn't load the helpdesk.</Trans>
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {query.data && items.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {status === "open" ? (
              <Trans>No open helpdesk conversations.</Trans>
            ) : (
              <Trans>No resolved helpdesk conversations.</Trans>
            )}
          </p>
        ) : null}
        <ol>
          {items.map((item) => (
            <OperatorQueueRow
              key={item.id}
              item={item}
              status={status}
              selected={item.id === selectedId}
            />
          ))}
        </ol>
        {query.hasNextPage ? (
          <div className="p-3">
            <Button
              variant="outline"
              className="w-full"
              pending={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              <Trans>Load more</Trans>
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function OperatorQueueRow({
  item,
  status,
  selected,
}: {
  item: AdminHelpdeskItem;
  status: HelpdeskStatus;
  selected: boolean;
}) {
  const { i18n } = useLingui();
  return (
    <li className="border-border border-b">
      <Link
        to="/"
        search={{
          tab: "activity",
          section: "helpdesk",
          helpdeskId: String(item.id),
          helpdeskStatus: status === "resolved" ? "resolved" : undefined,
        }}
        className={cn(
          "flex items-center gap-3 p-3 text-start",
          selected && "border-primary border-s-2 bg-primary/7",
        )}
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
            {item.lastMessage?.body ??
              (item.lastMessage?.imageUrls.length ? (
                <Trans>Photo</Trans>
              ) : (
                <Trans>No messages</Trans>
              ))}
          </span>
        </span>
        <time
          dateTime={item.lastMessageAt ?? item.updatedAt}
          className="font-mono text-2xs text-muted-foreground"
        >
          {i18n.date(new Date(item.lastMessageAt ?? item.updatedAt), { dateStyle: "short" })}
        </time>
      </Link>
    </li>
  );
}

function OperatorThreadDesk({ id }: { id: number }) {
  const thread = useOperatorHelpdeskThread(id);
  const conversation = thread.item.data;
  const messages = operatorHelpdeskMessages(thread.messages.data?.items ?? []);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <header className="flex h-13 shrink-0 items-center gap-3 border-border border-b px-4">
        {conversation ? <PeerAvatar peer={conversation.user} /> : null}
        <h2 className="min-w-0 flex-1 font-heading text-base font-semibold">
          {conversation ? (
            <PeerName peer={conversation.user} className="truncate" />
          ) : (
            <Trans>Conversation</Trans>
          )}
        </h2>
        {conversation ? (
          <>
            <Badge size="sm" caps variant="outline">
              {conversation.status === "open" ? <Trans>Open</Trans> : <Trans>Resolved</Trans>}
            </Badge>
            <Button
              variant={conversation.status === "open" ? "default" : "outline"}
              pending={thread.setStatus.isPending}
              onClick={() =>
                thread.setStatus.mutate(conversation.status === "open" ? "resolved" : "open")
              }
            >
              {conversation.status === "open" ? <Trans>Resolve</Trans> : <Trans>Reopen</Trans>}
            </Button>
          </>
        ) : null}
      </header>
      {thread.item.isError && !conversation ? (
        <div className="grid justify-items-start gap-2 p-4">
          <p role="alert" className="text-sm">
            <Trans>Couldn't load this conversation.</Trans>
          </p>
          <Button variant="outline" onClick={() => void thread.item.refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : (
        <MessageScrollerDesk
          before={
            <>
              {thread.item.isPending || thread.messages.isPending ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Spinner />
                  <Trans>Loading conversation…</Trans>
                </p>
              ) : null}
              {thread.messages.isError && !thread.messages.data ? (
                <div className="grid justify-items-start gap-2">
                  <p role="alert" className="text-sm">
                    <Trans>Couldn't load messages.</Trans>
                  </p>
                  <Button variant="outline" onClick={() => void thread.messages.refetch()}>
                    <Trans>Try again</Trans>
                  </Button>
                </div>
              ) : null}
            </>
          }
          after={
            thread.messages.data && messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Trans>No messages yet.</Trans>
              </p>
            ) : null
          }
          messages={messages}
          hasOlder={thread.messages.data?.hasOlder ?? false}
          loadingOlder={thread.loadOlder.isPending}
          onLoadOlder={() => thread.loadOlder.mutate()}
          onNewestOnScreenChange={() => undefined}
        />
      )}
      {conversation ? (
        <footer className="shrink-0 border-border border-t p-4">
          <OperatorHelpdeskComposer conversationId={id} desktop />
          {thread.setStatus.isError ? (
            <p role="alert" className="mt-2 text-destructive text-xs">
              <Trans>That didn't work. Try again.</Trans>
            </p>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
