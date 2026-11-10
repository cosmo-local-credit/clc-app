import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { isMessagingNotificationKind } from "../logic/payload-schema";
import { NOTIFICATION_INBOX_CHANGED_EVENT } from "../realtime/events";
import {
  isNotificationStorageAvailable,
  listNotificationInboxMessages,
} from "../storage/notification-db";

const notificationInboxKey = (address: string) =>
  ["notifications", "inbox", address.toLowerCase()] as const;

/**
 * The durable in-app inbox for the signed-in wallet, newest first, without the
 * messaging kinds: those already show in Messages and Helpdesk.
 *
 * It reads IndexedDB, which the notification session fills; that session
 * announces each change with `clc-notification-inbox-changed`.
 */
export function useNotificationInbox() {
  const auth = useAuthStatus();
  const address = auth.isAuthenticated ? auth.address : undefined;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationInboxKey(address ?? ""),
    queryFn: async () => {
      if (!address || !isNotificationStorageAvailable()) return [];
      const messages = await listNotificationInboxMessages(address);
      return messages.filter((message) => !isMessagingNotificationKind(message.kind));
    },
    enabled: address !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!address) return;
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: notificationInboxKey(address) });
    window.addEventListener(NOTIFICATION_INBOX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATION_INBOX_CHANGED_EVENT, refresh);
  }, [address, queryClient]);

  return query;
}
