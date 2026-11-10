import { transientBackendReadQueryPolicy } from "@clc/api/client/errors";
import { conversationListInfiniteQueryOptions } from "@clc/api/features/messaging/queries";
import type { ConversationKind } from "@clc/core/features/messaging/logic";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { messagingClient } from "#/lib/api/messaging";
import { useMessagingViewer } from "./use-messaging-viewer";

const LIST_POLL_MS = 30_000;

/**
 * The caller's conversations of one kind. Mount it only where the list is on
 * screen: it polls every 30 seconds while the document is visible, and on focus
 * and reconnect.
 */
export function useConversationList(kind: ConversationKind) {
  const viewer = useMessagingViewer();
  const query = useInfiniteQuery({
    ...conversationListInfiniteQueryOptions(messagingClient, viewer ?? "", kind),
    ...transientBackendReadQueryPolicy,
    staleTime: 4_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: LIST_POLL_MS,
    refetchIntervalInBackground: false,
    enabled: viewer !== undefined,
  });
  const conversations = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  return { ...query, conversations };
}
