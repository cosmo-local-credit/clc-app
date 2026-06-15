import { z } from "zod";
import { NOTIFICATION_WORKER_PROTOCOL_VERSION } from "./version";

export {
  NOTIFICATION_SERVICE_WORKER_VERSION,
  NOTIFICATION_WORKER_PROTOCOL_VERSION,
} from "./version";

const protocolVersionSchema = z.literal(NOTIFICATION_WORKER_PROTOCOL_VERSION);
const requestIdSchema = z.string().trim().min(1).max(128);

const compatibilityCheckSchema = z.object({
  requestId: requestIdSchema,
  supportedProtocolVersions: z.array(z.number().int().positive()).min(1),
  type: z.literal("notification:check-compatibility"),
});

const versionedPageMessageBase = {
  protocolVersion: protocolVersionSchema,
  requestId: requestIdSchema,
};

export const notificationPageMessageSchema = z.discriminatedUnion("type", [
  compatibilityCheckSchema,
  z.object({
    ...versionedPageMessageBase,
    type: z.literal("notification:flush-ack-queue"),
  }),
  z.object({
    ...versionedPageMessageBase,
    serviceWorkerVersion: z.string().trim().min(1).max(128),
    type: z.literal("notification:registration-state-updated"),
  }),
  z.object({
    ...versionedPageMessageBase,
    type: z.literal("notification:consume-delayed-clicks"),
  }),
]);

const pendingClickEventSchema = z.object({
  actionId: z.string().optional(),
  createdAt: z.string(),
  eventId: z.string(),
  notificationId: z.string(),
  targetUrl: z.string(),
});

export const notificationWorkerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    compatible: z.boolean(),
    protocolVersion: protocolVersionSchema,
    requestId: requestIdSchema,
    type: z.literal("notification:compatibility-result"),
  }),
  z.object({
    event: z.enum(["clicked", "delivered"]),
    notificationId: z.string().trim().min(1).max(128),
    protocolVersion: protocolVersionSchema,
    targetUrl: z.string().optional(),
    type: z.literal("notification:event"),
  }),
  z.object({
    protocolVersion: protocolVersionSchema,
    requestId: requestIdSchema,
    type: z.literal("notification:ack-queue-flushed"),
  }),
  z.object({
    events: z.array(pendingClickEventSchema),
    protocolVersion: protocolVersionSchema,
    requestId: requestIdSchema,
    type: z.literal("notification:delayed-clicks"),
  }),
]);

export type NotificationPageMessage = z.infer<typeof notificationPageMessageSchema>;
export type NotificationWorkerMessage = z.infer<typeof notificationWorkerMessageSchema>;

export function createNotificationEventMessage(
  event: "clicked" | "delivered",
  notificationId: string,
  targetUrl?: string,
): NotificationWorkerMessage {
  return {
    event,
    notificationId,
    protocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
    targetUrl,
    type: "notification:event",
  };
}
