import type { ConversationKind } from "@clc/core/features/messaging/logic";
import { parseActivitySection, type ActivitySection } from "#/lib/navigation/activity-search";
import {
  isActivityApprovalNotificationKind,
  isMessagingNotificationKind,
  type NotificationPayload,
} from "./payload-schema";
import { messageThreadConversationId } from "./target-url";

export type NotificationActivityContext = {
  section: ActivitySection | null;
  conversationId?: number;
} | null;

export type NotificationActivitySource = {
  current: () => NotificationActivityContext;
  subscribe: (listener: () => void) => () => void;
};

export function notificationActivityContext(
  location: { pathname: string; search: Record<string, unknown> },
  conversationKind?: ConversationKind,
): NotificationActivityContext {
  if (location.pathname === "/" && location.search.tab === "activity")
    return { section: parseActivitySection(location.search.section) };
  const conversationId = messageThreadConversationId(location.pathname);
  if (conversationId === null) return null;
  return {
    section:
      conversationKind === undefined
        ? null
        : conversationKind === "helpdesk"
          ? "helpdesk"
          : "messages",
    conversationId,
  };
}

/** Logical Activity destinations also cover alerts whose link opens a resource detail. */
export function isNotificationActivityVisible(
  payload: NotificationPayload,
  context: NotificationActivityContext,
): boolean {
  if (!context) return false;
  if (context.section === null) {
    const conversationId = payload.conversationId
      ? Number(payload.conversationId)
      : messageThreadConversationId(payload.targetUrl);
    return isMessagingNotificationKind(payload.kind) && conversationId === context.conversationId;
  }
  if (payload.kind === "helpdesk.reply") return context.section === "helpdesk";
  if (isMessagingNotificationKind(payload.kind)) return context.section === "messages";
  if (isActivityApprovalNotificationKind(payload.kind)) return context.section === "notifications";
  return payload.kind === "voucher.received" && context.section === "transactions";
}
