import { Trans } from "@lingui/react/macro";
import type { MessageContextInput, MessageLaunchContext } from "@clc/core/features/messaging/logic";
import type { ReactNode } from "react";
import { RiChat3Line } from "react-icons/ri";

import { ConversationListDesk } from "#/desktop/messaging/conversation-list-desk";
import { DeskInboxFrame } from "#/desktop/messaging/inbox-frame";
import { ThreadDesk } from "#/desktop/messaging/thread-desk";

/**
 * Activity's Messages: the conversation list beside the open thread. The
 * inbox itself (`?section=messages`) has no thread open; `/messages/$id`
 * opens one beside the same list.
 */
export function MessagesDesk({
  header,
  conversationId,
  messageTo,
  messageContext,
  threadContext,
  onThreadContextSent,
  onMessageToConsumed,
}: {
  header: ReactNode;
  conversationId?: number;
  messageTo?: `0x${string}`;
  messageContext?: MessageLaunchContext;
  threadContext?: MessageContextInput;
  onThreadContextSent?: () => void;
  onMessageToConsumed?: () => void;
}) {
  return (
    <DeskInboxFrame header={header}>
      <ConversationListDesk
        selectedId={conversationId}
        messageTo={messageTo}
        messageContext={messageContext}
        onMessageToConsumed={onMessageToConsumed}
      />
      {conversationId === undefined ? (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
          <RiChat3Line className="size-6" aria-hidden="true" />
          <p className="text-sm">
            <Trans>No conversation open</Trans>
          </p>
        </div>
      ) : (
        <ThreadDesk
          key={conversationId}
          conversationId={conversationId}
          initialContext={threadContext}
          onContextSent={onThreadContextSent}
        />
      )}
    </DeskInboxFrame>
  );
}
