import { transientBackendReadQueryPolicy } from "@clc/api/client/errors";
import { conversationUnreadQueryOptions } from "@clc/api/features/messaging/queries";
import { type UnreadCounts, messagesSectionUnread } from "@clc/core/features/messaging/logic";
import { useQuery } from "@tanstack/react-query";

import { messagingClient } from "#/lib/api/messaging";
import { useMessagingViewer } from "./use-messaging-viewer";

/** The same refresh policy as the Transactions count in `useActivityUnseen`. */
const UNREAD_POLL_MS = 30_000;

/**
 * Unread messages, requests and support replies, from `GET /conversations/unread`.
 * Zero everywhere for a guest or with messaging off.
 */
export function useMessagingUnread(): {
  counts: UnreadCounts | undefined;
  messages: number;
  helpdesk: number;
} {
  const viewer = useMessagingViewer();
  const query = useQuery({
    ...conversationUnreadQueryOptions(messagingClient, viewer ?? ""),
    ...transientBackendReadQueryPolicy,
    staleTime: 4_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    enabled: viewer !== undefined,
  });
  const counts = viewer ? query.data : undefined;
  return {
    counts,
    messages: messagesSectionUnread(counts),
    helpdesk: counts?.helpdesk ?? 0,
  };
}
