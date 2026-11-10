import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  MESSAGING_CHANGED_EVENT,
  messagingChangedConversationId,
  NOTIFICATION_INBOX_CHANGED_EVENT,
} from "#/features/notifications/realtime/events";
import { invalidateForMessagingEvent } from "../logic/invalidation";
import { useMessagingViewer } from "./use-messaging-viewer";

/**
 * Applies the realtime invalidation rules for the signed-in viewer. Mounted
 * once at the root, beside the notification session that dispatches the events,
 * so both views and the thread route get them.
 */
export function useMessagingRealtime(): void {
  const viewer = useMessagingViewer();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!viewer) return;
    const onInbox = () => void invalidateForMessagingEvent(queryClient, viewer, { kind: "inbox" });
    const onMessaging = (event: Event) =>
      void invalidateForMessagingEvent(queryClient, viewer, {
        kind: "messaging",
        conversationId: messagingChangedConversationId(event),
      });
    window.addEventListener(NOTIFICATION_INBOX_CHANGED_EVENT, onInbox);
    window.addEventListener(MESSAGING_CHANGED_EVENT, onMessaging);
    return () => {
      window.removeEventListener(NOTIFICATION_INBOX_CHANGED_EVENT, onInbox);
      window.removeEventListener(MESSAGING_CHANGED_EVENT, onMessaging);
    };
  }, [queryClient, viewer]);
}
