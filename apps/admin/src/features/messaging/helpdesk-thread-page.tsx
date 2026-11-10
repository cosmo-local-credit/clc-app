import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { AdminHelpdeskItem, AdminMessage } from "@clc/core/features/messaging/logic";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { SectionHeading } from "#/components/admin/section-heading";
import { StaleNotice } from "#/components/admin/stale-notice";
import { StateBadge } from "#/components/admin/state-badge";
import { Button } from "#/components/ui/button";
import { useAdminSession } from "#/features/auth/admin-session";
import { errorMessage } from "#/lib/data-state";
import { formatDateTime } from "#/lib/format";
import { cn } from "#/lib/utils";
import { MessageImages } from "./ui/message-images";
import { PeerIdentity, peerName } from "./ui/peer-identity";
import { ReplyComposer } from "./ui/reply-composer";
import {
  useHelpdeskItem,
  useHelpdeskMessages,
  useHelpdeskStatus,
  useLoadOlderHelpdeskMessages,
} from "./use-helpdesk";

export function HelpdeskThreadPage({ conversationId }: { conversationId: string }) {
  const id = Number(conversationId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return (
      <PageState
        title="Invalid conversation"
        message="The conversation ID must be a positive integer."
      />
    );
  }
  return <HelpdeskThread key={id} id={id} />;
}

function HelpdeskThread({ id }: { id: number }) {
  const item = useHelpdeskItem(id);

  if (item.isPending) return <LoadingBlock rows={6} />;
  if (!item.data) {
    return (
      <div className="space-y-3">
        <PageState title="Could not load the conversation" message={errorMessage(item.error)} />
        <Button variant="outline" onClick={() => void item.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const conversation = item.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={peerName(conversation.user)}
        breadcrumbs={
          <AppBreadcrumb
            items={[
              {
                label: "Helpdesk",
                to: "/helpdesk",
                search: conversation.status === "resolved" ? { status: "resolved" } : {},
              },
              { label: `#${conversation.id}` },
            ]}
          />
        }
        actions={<StatusControl conversation={conversation} />}
      />
      {item.isError ? <StaleNotice message={errorMessage(item.error)} /> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <MessageThread id={id} />
          <ReplyComposer conversationId={id} />
        </div>
        <aside className="border-border bg-card space-y-4 border p-4" aria-label="Conversation">
          <SectionHeading>User</SectionHeading>
          <PeerIdentity peer={conversation.user} />
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Opened</dt>
              <dd className="font-data text-xs">{formatDateTime(conversation.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Last message</dt>
              <dd className="font-data text-xs">{formatDateTime(conversation.lastMessageAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Reply</dt>
              <dd className="text-xs">
                {conversation.needsReply ? "Waiting on support" : "Not waiting on support"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function StatusControl({ conversation }: { conversation: AdminHelpdeskItem }) {
  const status = useHelpdeskStatus(conversation.id);
  const next = conversation.status === "open" ? "resolved" : "open";
  return (
    <>
      <StateBadge state={conversation.status} kind="conversation" />
      <Button
        variant={next === "resolved" ? "default" : "outline"}
        disabled={status.isPending}
        aria-busy={status.isPending || undefined}
        onClick={() =>
          status.mutate(next, {
            onSuccess: () =>
              toast.success(
                next === "resolved" ? "Conversation resolved" : "Conversation reopened",
              ),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      >
        {status.isPending ? "Saving…" : next === "resolved" ? "Resolve" : "Reopen"}
      </Button>
    </>
  );
}

function MessageThread({ id }: { id: number }) {
  const messages = useHelpdeskMessages(id);
  const older = useLoadOlderHelpdeskMessages(id);
  const session = useAdminSession();
  const self = session.status === "authenticated" ? session.operator.address : undefined;
  const scroller = useRef<HTMLDivElement>(null);
  const newestId = messages.data?.items.at(-1)?.id;

  // Follow new messages to the bottom; loading older ones leaves the view where it is.
  useEffect(() => {
    const element = scroller.current;
    if (element && newestId !== undefined) element.scrollTop = element.scrollHeight;
  }, [newestId]);

  if (messages.isPending) return <LoadingBlock rows={4} />;
  if (!messages.data) {
    return (
      <div className="space-y-3">
        <PageState title="Could not load messages" message={errorMessage(messages.error)} />
        <Button variant="outline" onClick={() => void messages.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { items, hasOlder } = messages.data;
  return (
    <section className="border-border bg-card border" aria-labelledby="helpdesk-messages-heading">
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="helpdesk-messages-heading" className="sr-only">
          Messages
        </h2>
        <span className="font-data text-muted-foreground text-xs">
          {items.length} {items.length === 1 ? "message" : "messages"}
          {hasOlder ? " loaded" : ""}
        </span>
        {hasOlder ? (
          <Button
            size="sm"
            variant="outline"
            disabled={older.isPending}
            aria-busy={older.isPending || undefined}
            onClick={() =>
              older.mutate(undefined, { onError: (error) => toast.error(errorMessage(error)) })
            }
          >
            {older.isPending ? "Loading…" : "Load older messages"}
          </Button>
        ) : null}
      </div>
      {messages.isError ? (
        <div className="p-4 pb-0">
          <StaleNotice message={errorMessage(messages.error)} />
        </div>
      ) : null}
      <div ref={scroller} className="max-h-[60vh] overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">No messages yet.</p>
        ) : (
          <ol className="divide-border divide-y">
            {items.map((message) => (
              <MessageRow key={message.id} message={message} self={self} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function MessageRow({ message, self }: { message: AdminMessage; self: string | undefined }) {
  const support = message.sender === "support";
  return (
    <li
      className={cn("space-y-2 px-4 py-3", support && "bg-muted/30 border-l-primary border-l-2")}
      aria-label={`${support ? "Support" : "User"} message ${message.id}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{support ? "Support" : "User"}</span>
        {support && message.adminAddress ? (
          <span className="font-data text-muted-foreground text-xs" title={message.adminAddress}>
            {formatVoucherAddress(message.adminAddress as `0x${string}`)}
            {message.adminAddress === self ? " (you)" : ""}
          </span>
        ) : null}
        <time
          className="font-data text-muted-foreground ml-auto text-xs"
          dateTime={message.createdAt}
        >
          {formatDateTime(message.createdAt)}
        </time>
      </div>
      {message.body ? (
        <p dir="auto" className="whitespace-pre-wrap break-words text-sm">
          {message.body}
        </p>
      ) : null}
      <MessageImages urls={message.imageUrls} />
    </li>
  );
}
