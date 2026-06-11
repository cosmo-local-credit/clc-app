import type { NotificationPendingClickEvent } from "../storage/notification-db";
import {
  NOTIFICATION_WORKER_PROTOCOL_VERSION,
  notificationPageMessageSchema,
  type NotificationWorkerMessage,
} from "./protocol";

export type NotificationProtocolHandlerDependencies = {
  consumeDelayedClicks: () => Promise<NotificationPendingClickEvent[]>;
  flushQueuedAcks: () => Promise<unknown>;
  updateRegistrationState: (serviceWorkerVersion: string) => Promise<unknown>;
};

export async function handleNotificationProtocolMessage(
  rawMessage: unknown,
  respond: (message: NotificationWorkerMessage) => void,
  dependencies: NotificationProtocolHandlerDependencies,
): Promise<"handled" | "ignored"> {
  const result = notificationPageMessageSchema.safeParse(rawMessage);
  if (!result.success) {
    return "ignored";
  }

  const message = result.data;
  if (message.type === "notification:check-compatibility") {
    respond({
      compatible: message.supportedProtocolVersions.includes(NOTIFICATION_WORKER_PROTOCOL_VERSION),
      protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
      requestId: message.requestId,
      type: "notification:compatibility-result",
    });
    return "handled";
  }

  if (message.type === "notification:flush-ack-queue") {
    await dependencies.flushQueuedAcks();
    respond({
      protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
      requestId: message.requestId,
      type: "notification:ack-queue-flushed",
    });
    return "handled";
  }

  if (message.type === "notification:registration-state-updated") {
    await dependencies.updateRegistrationState(message.serviceWorkerVersion);
    return "handled";
  }

  const events = await dependencies.consumeDelayedClicks();
  respond({
    events,
    protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
    requestId: message.requestId,
    type: "notification:delayed-clicks",
  });
  return "handled";
}
