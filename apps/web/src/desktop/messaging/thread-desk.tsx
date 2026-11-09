import { BackendApiError } from "@clc/api/client/errors";
import {
  type Conversation,
  conversationActions,
  newestMessageId,
} from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useId } from "react";

import { PeerAvatar, PeerName } from "#/components/messaging/peer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { ComposerDesk } from "#/desktop/messaging/composer-desk";
import { MessageScrollerDesk } from "#/desktop/messaging/message-scroller-desk";
import { ThreadMenuDesk } from "#/desktop/messaging/thread-menu-desk";
import {
  useBlockPeer,
  useRequestConversation,
  useSetConversationStatus,
} from "#/features/messaging/hooks/use-conversation-actions";
import {
  useConversationThread,
  useMarkConversationRead,
} from "#/features/messaging/hooks/use-conversation-thread";

/**
 * One conversation in the inbox panel: its header and menu, a pending
 * request's Accept and Decline, the messages, and the composer. The read
 * marker moves once the newest message is on screen.
 */
export function ThreadDesk({ conversationId }: { conversationId: number }) {
  const titleId = useId();
  const { conversation, messages, loadOlder } = useConversationThread(conversationId);
  const items = messages.data?.items ?? [];
  const current = conversation.data;
  const reportNewestOnScreen = useMarkConversationRead(current, newestMessageId(items));
  const missing =
    conversation.error instanceof BackendApiError && conversation.error.status === 404;
  const actions = current ? conversationActions(current) : null;

  return (
    <section aria-labelledby={titleId} className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <header className="flex h-13 shrink-0 items-center gap-3 border-border border-b px-4">
        {current ? <PeerAvatar peer={current.peer} /> : null}
        <h2
          id={titleId}
          className="flex min-w-0 flex-1 items-center gap-2 font-heading text-base font-semibold"
        >
          {current ? (
            <PeerName peer={current.peer} className="truncate" />
          ) : (
            <Trans>Conversation</Trans>
          )}
          {current?.kind === "direct" && current.status === "pending" ? (
            <Badge size="sm" caps variant={current.canAccept ? "primary" : "outline"}>
              {current.canAccept ? <Trans>Request</Trans> : <Trans>Pending</Trans>}
            </Badge>
          ) : null}
          {current?.kind === "helpdesk" && current.status === "resolved" ? (
            <Badge size="sm" caps variant="outline">
              <Trans>Resolved</Trans>
            </Badge>
          ) : null}
        </h2>
        {current?.kind === "direct" ? (
          <ThreadMenuDesk conversation={current} messages={items} />
        ) : null}
      </header>

      {missing ? (
        <p role="alert" className="p-4 text-sm">
          <Trans>This conversation isn't available.</Trans>
        </p>
      ) : conversation.isError && !current ? (
        <div className="grid justify-items-start gap-2 p-4">
          <p role="alert" className="text-sm">
            <Trans>Couldn't load this conversation.</Trans>
          </p>
          <Button
            variant="outline"
            pending={conversation.isFetching}
            onClick={() => {
              void conversation.refetch();
              void messages.refetch();
            }}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : (
        <MessageScrollerDesk
          before={
            <>
              {conversation.isPending && conversation.fetchStatus !== "idle" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  <Trans>Loading conversation…</Trans>
                </p>
              ) : null}
              {current ? <ThreadNotices conversation={current} /> : null}
              {messages.isError && !messages.data ? (
                <div className="grid justify-items-start gap-2">
                  <p role="alert" className="text-sm text-muted-foreground">
                    <Trans>Couldn't load messages.</Trans>
                  </p>
                  <Button
                    variant="outline"
                    pending={messages.isFetching}
                    onClick={() => void messages.refetch()}
                  >
                    <Trans>Try again</Trans>
                  </Button>
                </div>
              ) : null}
            </>
          }
          after={
            messages.data && items.length === 0 && current && current.status !== "pending" ? (
              <p className="text-sm text-muted-foreground">
                {current.kind === "helpdesk" ? (
                  <Trans>Ask Support anything.</Trans>
                ) : (
                  <Trans>No messages yet.</Trans>
                )}
              </p>
            ) : null
          }
          messages={items}
          hasOlder={messages.data?.hasOlder ?? false}
          loadingOlder={loadOlder.isPending}
          onLoadOlder={() => loadOlder.mutate()}
          onNewestOnScreenChange={reportNewestOnScreen}
        />
      )}

      {current && actions?.canSend ? (
        <footer className="shrink-0 border-border border-t p-4">
          <ComposerDesk conversationId={conversationId} />
        </footer>
      ) : null}
    </section>
  );
}

/** What stands between the caller and the composer: a request, a decline, a block. */
function ThreadNotices({ conversation }: { conversation: Conversation }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const actions = conversationActions(conversation);
  const setStatus = useSetConversationStatus(conversation.id);
  const unblock = useBlockPeer(conversation.id);
  const request = useRequestConversation();
  const peer = conversation.peer;

  return (
    <>
      {conversation.kind === "direct" && conversation.status === "pending" ? (
        <section
          className="grid gap-3 border border-border bg-background p-4"
          aria-label={t`Request`}
        >
          {conversation.intro ? (
            <p dir="auto" className="whitespace-pre-wrap break-words text-sm">
              {conversation.intro}
            </p>
          ) : null}
          {actions.canDecline ? (
            <div className="flex gap-2">
              <Button
                disabled={!actions.canAccept}
                pending={setStatus.isPending && setStatus.variables === "accepted"}
                onClick={() => setStatus.mutate("accepted")}
              >
                <Trans>Accept</Trans>
              </Button>
              <Button
                variant="outline"
                pending={setStatus.isPending && setStatus.variables === "declined"}
                onClick={() => setStatus.mutate("declined")}
              >
                <Trans>Decline</Trans>
              </Button>
            </div>
          ) : (
            <p className="text-sm">
              <Trans>Waiting for them to accept your request.</Trans>
            </p>
          )}
          {setStatus.isError ? (
            <p role="alert" className="text-xs text-destructive">
              <Trans>That didn't work. Try again.</Trans>
            </p>
          ) : null}
        </section>
      ) : null}

      {conversation.status === "declined" || conversation.status === "revoked" ? (
        <section className="grid justify-items-start gap-3 border border-border bg-background p-4">
          <p className="text-sm">
            {conversation.status === "declined" ? (
              <Trans>This request was declined.</Trans>
            ) : (
              <Trans>This conversation was revoked.</Trans>
            )}
          </p>
          {actions.canRequest && peer ? (
            <Button
              variant="outline"
              pending={request.isPending}
              onClick={() =>
                request.mutate(
                  { recipientAddress: peer.address },
                  {
                    onSuccess: (next) => {
                      if (next.id === conversation.id) return;
                      void navigate({
                        to: "/messages/$conversationId",
                        params: { conversationId: String(next.id) },
                        replace: true,
                      });
                    },
                  },
                )
              }
            >
              <Trans>Ask to talk again</Trans>
            </Button>
          ) : null}
          {request.isError ? (
            <p role="alert" className="text-xs text-destructive">
              <Trans>That didn't work. Try again.</Trans>
            </p>
          ) : null}
        </section>
      ) : null}

      {conversation.blocked && peer ? (
        <section className="grid justify-items-start gap-3 border border-border bg-background p-4">
          <p className="text-sm">
            <Trans>You blocked this person.</Trans>
          </p>
          <Button
            variant="outline"
            pending={unblock.isPending}
            onClick={() => unblock.mutate({ address: peer.address, blocked: false })}
          >
            <Trans>Unblock</Trans>
          </Button>
        </section>
      ) : null}
    </>
  );
}
