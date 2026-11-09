import { BackendApiError } from "@clc/api/client/errors";
import { conversationActions, newestMessageId } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PeerAvatar, PeerName } from "#/components/messaging/peer";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { BackChevron } from "#/components/wallet/wallet-kit";
import {
  useBlockPeer,
  useRequestConversation,
  useSetConversationStatus,
} from "../hooks/use-conversation-actions";
import { useConversationThread, useMarkConversationRead } from "../hooks/use-conversation-thread";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import { ThreadMenuSheet } from "./thread-menu-sheet";

/** One conversation, full screen. Back returns to the inbox it was opened from. */
export function ThreadPage({ conversationId }: { conversationId: number }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { conversation, messages, loadOlder } = useConversationThread(conversationId);
  const [newestOnScreen, setNewestOnScreen] = useState(false);
  const items = messages.data?.items ?? [];
  const current = conversation.data;
  useMarkConversationRead(current, newestMessageId(items), newestOnScreen);
  const setStatus = useSetConversationStatus(conversationId);
  const unblock = useBlockPeer(conversationId);
  const request = useRequestConversation();

  const helpdesk = current?.kind === "helpdesk";
  const missing =
    conversation.error instanceof BackendApiError && conversation.error.status === 404;
  const actions = current ? conversationActions(current) : null;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-border border-b bg-background px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3">
        <BackChevron
          label={helpdesk ? t`Helpdesk` : t`Messages`}
          to="/"
          search={{ tab: "activity", section: helpdesk ? "helpdesk" : "messages" }}
        />
        <div className="flex items-center gap-3">
          {current ? <PeerAvatar peer={current.peer} /> : null}
          <h1 className="min-w-0 flex-1 truncate font-heading text-[1.75rem] font-bold leading-tight">
            {current ? <PeerName peer={current.peer} /> : <Trans>Conversation</Trans>}
          </h1>
          {current && current.kind === "direct" ? (
            <ThreadMenuSheet conversation={current} messages={items} />
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-4 py-4">
        {conversation.isPending && conversation.fetchStatus !== "idle" ? (
          <ListSkeleton label={<Trans>Loading conversation…</Trans>} count={3} />
        ) : null}
        {missing ? (
          <p role="alert" className="border border-border bg-card p-4 text-sm">
            <Trans>This conversation isn't available.</Trans>
          </p>
        ) : conversation.isError && !current ? (
          <div className="space-y-2 border border-border bg-card p-4">
            <p role="alert" className="text-sm">
              <Trans>Couldn't load this conversation.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={conversation.isFetching}
              onClick={() => {
                void conversation.refetch();
                void messages.refetch();
              }}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}

        {current && current.kind === "direct" && current.status === "pending" ? (
          <section className="space-y-3 border border-border bg-card p-4" aria-label={t`Request`}>
            {current.intro ? (
              <p dir="auto" className="whitespace-pre-wrap break-words text-sm">
                {current.intro}
              </p>
            ) : null}
            {actions?.canDecline ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  tap
                  disabled={!actions.canAccept}
                  pending={setStatus.isPending && setStatus.variables === "accepted"}
                  onClick={() => setStatus.mutate("accepted")}
                >
                  <Trans>Accept</Trans>
                </Button>
                <Button
                  variant="outline"
                  tap
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
              <p role="alert" className="text-destructive text-xs">
                <Trans>That didn't work. Try again.</Trans>
              </p>
            ) : null}
          </section>
        ) : null}

        {current && (current.status === "declined" || current.status === "revoked") ? (
          <section className="space-y-3 border border-border bg-card p-4">
            <p className="text-sm">
              {current.status === "declined" ? (
                <Trans>This request was declined.</Trans>
              ) : (
                <Trans>This conversation was revoked.</Trans>
              )}
            </p>
            {actions?.canRequest && current.peer ? (
              <Button
                variant="outline"
                tap
                pending={request.isPending}
                onClick={() => {
                  if (!current.peer) return;
                  request.mutate(
                    { recipientAddress: current.peer.address },
                    {
                      onSuccess: (next) => {
                        if (next.id !== current.id) {
                          void navigate({
                            to: "/messages/$conversationId",
                            params: { conversationId: String(next.id) },
                            replace: true,
                          });
                        }
                      },
                    },
                  );
                }}
              >
                <Trans>Ask to talk again</Trans>
              </Button>
            ) : null}
            {request.isError ? (
              <p role="alert" className="text-destructive text-xs">
                <Trans>That didn't work. Try again.</Trans>
              </p>
            ) : null}
          </section>
        ) : null}

        {current?.blocked && current.peer ? (
          <section className="space-y-3 border border-border bg-card p-4">
            <p className="text-sm">
              <Trans>You blocked this person.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={unblock.isPending}
              onClick={() => {
                if (current.peer) unblock.mutate({ address: current.peer.address, blocked: false });
              }}
            >
              <Trans>Unblock</Trans>
            </Button>
          </section>
        ) : null}

        {messages.isError && !messages.data ? (
          <div className="space-y-2">
            <p role="alert" className="text-muted-foreground text-sm">
              <Trans>Couldn't load messages.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={messages.isFetching}
              onClick={() => void messages.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {messages.data ? (
          <MessageList
            messages={items}
            hasOlder={messages.data.hasOlder}
            loadingOlder={loadOlder.isPending}
            onLoadOlder={() => loadOlder.mutate()}
            onNewestVisibleChange={setNewestOnScreen}
          />
        ) : null}
        {messages.data && items.length === 0 && current?.status !== "pending" ? (
          <p className="text-muted-foreground text-sm">
            {helpdesk ? <Trans>Ask Support anything.</Trans> : <Trans>No messages yet.</Trans>}
          </p>
        ) : null}
      </main>

      {current && actions?.canSend ? (
        <footer className="sticky bottom-0 border-border border-t bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <MessageComposer conversationId={conversationId} />
        </footer>
      ) : null}
    </div>
  );
}
