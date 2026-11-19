import type { AdminMessage, Message } from "@clc/core/features/messaging/logic";

/** Adapts the admin Helpdesk wire model to the existing message-bubble presentation. */
export function operatorHelpdeskMessages(messages: readonly AdminMessage[]): Message[] {
  return messages.map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    clientId: message.clientId,
    sender: message.sender === "support" ? "self" : "peer",
    body: message.body,
    imageUrls: message.imageUrls,
    context: null,
    createdAt: message.createdAt,
  }));
}
