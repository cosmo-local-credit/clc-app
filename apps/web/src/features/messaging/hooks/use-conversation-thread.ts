import { transientBackendReadQueryPolicy } from "@clc/api/client/errors";
import {
  conversationMessagesQueryOptions,
  conversationQueryOptions,
  loadOlderConversationMessages,
  messagingKeys,
} from "@clc/api/features/messaging/queries";
import { type Conversation, readMarkerTarget } from "@clc/core/features/messaging/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { messagingClient } from "#/lib/api/messaging";
import { useMessagingViewer } from "./use-messaging-viewer";

const THREAD_POLL_MS = 5_000;

/** Polls while the document is visible, and refreshes on focus and reconnect. */
const threadRefreshPolicy = {
  ...transientBackendReadQueryPolicy,
  staleTime: 2_000,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
  refetchInterval: THREAD_POLL_MS,
  refetchIntervalInBackground: false,
} as const;

/**
 * One open thread: its conversation (status, peer, read marker) and its
 * messages. Each poll is `GET /conversations/:id` plus one
 * `GET /conversations/:id/messages?after=<newest fetched id>`, so a decline or revoke
 * arrives through the first and new messages through the second.
 *
 * Shared by the phone thread and the desktop inspector.
 */
export function useConversationThread(conversationId: number) {
  const viewer = useMessagingViewer();
  const queryClient = useQueryClient();
  const enabled = viewer !== undefined;
  const conversation = useQuery({
    ...conversationQueryOptions(messagingClient, viewer ?? "", conversationId),
    ...threadRefreshPolicy,
    enabled,
  });
  const messages = useQuery({
    ...conversationMessagesQueryOptions(messagingClient, viewer ?? "", conversationId),
    ...threadRefreshPolicy,
    enabled,
  });
  const loadOlder = useMutation({
    mutationFn: () =>
      loadOlderConversationMessages(messagingClient, queryClient, viewer ?? "", conversationId),
  });
  return { viewer, conversation, messages, loadOlder };
}

/**
 * Moves the caller's read marker to the newest message once it is on screen
 * and the document is visible. Sends each id at most once; the server keeps the
 * marker monotonic, so a racing device cannot move it back.
 *
 * Returns the callback the message list reports to: the id of the newest
 * message it has observed on screen, or undefined. Visibility belongs to that
 * id, so a message that arrives while its predecessor is on screen is not read
 * until the observer reports it too.
 */
export function useMarkConversationRead(
  conversation: Conversation | undefined,
  newestId: number | undefined,
): (onScreenId: number | undefined) => void {
  const viewer = useMessagingViewer();
  const [onScreenId, setOnScreenId] = useState<number | undefined>(undefined);
  const queryClient = useQueryClient();
  const sent = useRef<number | null>(null);
  const markRead = useMutation({
    mutationFn: ({ id, messageId }: { id: number; messageId: number }) =>
      messagingClient.markRead(id, messageId),
    onSuccess: (_result, { id, messageId }) => {
      if (!viewer) return;
      queryClient.setQueryData<Conversation>(messagingKeys.conversation(viewer, id), (current) =>
        current
          ? {
              ...current,
              lastReadMessageId: Math.max(current.lastReadMessageId ?? 0, messageId),
              unreadCount: 0,
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: messagingKeys.unread(viewer) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.lists(viewer) });
    },
    onError: () => {
      // Let the next render try again.
      sent.current = null;
    },
  });
  const target =
    conversation && onScreenId === newestId
      ? readMarkerTarget(newestId, conversation.lastReadMessageId)
      : null;
  const { mutate } = markRead;

  useEffect(() => {
    if (!conversation || target === null) return;
    const attempt = () => {
      if (document.visibilityState !== "visible" || sent.current === target) return;
      sent.current = target;
      mutate({ id: conversation.id, messageId: target });
    };
    attempt();
    document.addEventListener("visibilitychange", attempt);
    return () => document.removeEventListener("visibilitychange", attempt);
  }, [conversation, mutate, target]);

  return setOnScreenId;
}
