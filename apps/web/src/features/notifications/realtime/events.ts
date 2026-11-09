/** Dispatched on `window` after the durable inbox changed. Carries no detail. */
export const NOTIFICATION_INBOX_CHANGED_EVENT = "clc-notification-inbox-changed";

/** Dispatched on `window` when a messaging sync publication arrives. */
export const MESSAGING_CHANGED_EVENT = "clc-messaging-changed";

export type MessagingChangedDetail = { conversationId: number };

export function dispatchMessagingChanged(conversationId: number): void {
  window.dispatchEvent(
    new CustomEvent<MessagingChangedDetail>(MESSAGING_CHANGED_EVENT, {
      detail: { conversationId },
    }),
  );
}

/** The conversation a messaging event names, or null; 0 means none. */
export function messagingChangedConversationId(event: Event): number | null {
  const detail = (event as CustomEvent<Partial<MessagingChangedDetail> | null>).detail;
  const id = detail?.conversationId;
  return typeof id === "number" && id > 0 ? id : null;
}
