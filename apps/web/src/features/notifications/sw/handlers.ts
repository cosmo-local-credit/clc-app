import { z } from "zod";
import type {
  SendNotificationClickAckRequest,
  SendNotificationDeliveryAckRequest,
} from "../api/notification-client";
import {
  getNotificationKindPolicy,
  type NotificationPayload,
  notificationKindSchema,
  parseNotificationPayload,
} from "../logic/payload-schema";
import { normalizeNotificationTargetUrl } from "../logic/target-url";
import type {
  EnqueueNotificationAckInput,
  NotificationInboxMessage,
  NotificationPendingClickEvent,
} from "../storage/notification-db";
import { createNotificationEventMessage, type NotificationWorkerMessage } from "./protocol";

export type NotificationClickInput = {
  action: string;
  close: () => void;
  data: unknown;
};

export type NotificationServiceWorkerDependencies = {
  appOrigin: string;
  broadcast: (message: NotificationWorkerMessage) => Promise<unknown>;
  enqueueAck: (input: EnqueueNotificationAckInput) => Promise<unknown>;
  flushQueuedAcks: () => Promise<unknown>;
  focusOrOpen: (targetUrl: string, beforeOpen: () => Promise<unknown>) => Promise<unknown>;
  getDeviceId: () => Promise<string>;
  markInboxMessageActioned: (notificationId: string, at: string) => Promise<unknown>;
  markInboxMessageRead: (notificationId: string, at: string) => Promise<unknown>;
  now: () => string;
  saveInboxMessage: (message: NotificationInboxMessage) => Promise<unknown>;
  savePendingClickEvent: (
    event: Omit<NotificationPendingClickEvent, "createdAt" | "eventId">,
  ) => Promise<unknown>;
  sendClickAck: (request: SendNotificationClickAckRequest) => Promise<unknown>;
  sendDeliveryAck: (request: SendNotificationDeliveryAckRequest) => Promise<unknown>;
  showNotification: (title: string, options: NotificationOptions) => Promise<unknown>;
};

export type NotificationPushResult =
  | {
      notificationId: string;
      status: "displayed";
    }
  | {
      status: "ignored";
    };

export type NotificationClickResult =
  | {
      notificationId: string;
      status: "handled";
    }
  | {
      status: "ignored";
    };

const notificationDataSchema = z.object({
  kind: notificationKindSchema,
  notificationId: z.string().trim().min(1).max(128),
  targetUrl: z.string(),
  walletAddressTarget: z.string().optional(),
});

type NotificationOptionsWithRenotify = NotificationOptions & {
  renotify: boolean;
};

export async function handleNotificationPush(
  rawPayload: unknown,
  dependencies: NotificationServiceWorkerDependencies,
): Promise<NotificationPushResult> {
  const result = parseNotificationPayload(rawPayload, {
    appOrigin: dependencies.appOrigin,
  });

  if (!result.success) {
    return { status: "ignored" };
  }

  const receivedAt = dependencies.now();
  const message: NotificationInboxMessage = {
    ...result.payload,
    rawPayload: result.rawPayload,
    receivedAt,
  };
  const persistence = settle(dependencies.saveInboxMessage(message));

  try {
    await dependencies.showNotification(
      result.payload.title,
      createNotificationOptions(result.payload),
    );
  } catch (error) {
    await persistence;
    throw error;
  }

  const shownAt = dependencies.now();
  await Promise.all([
    persistence,
    settle(
      dependencies.broadcast({
        ...createNotificationEventMessage("delivered", result.payload.notificationId),
      }),
    ),
    settle(
      sendDeliveryAckOrQueue(
        {
          notificationId: result.payload.notificationId,
          receivedAt,
          shownAt,
          walletAddressTarget: result.payload.walletAddressTarget,
        },
        dependencies,
      ),
    ),
  ]);

  return {
    notificationId: result.payload.notificationId,
    status: "displayed",
  };
}

export async function handleNotificationClick(
  input: NotificationClickInput,
  dependencies: NotificationServiceWorkerDependencies,
): Promise<NotificationClickResult> {
  input.close();

  const result = notificationDataSchema.safeParse(input.data);
  if (!result.success) {
    return { status: "ignored" };
  }

  const targetUrl = normalizeNotificationTargetUrl(result.data.targetUrl, dependencies.appOrigin);
  if (!targetUrl) {
    return { status: "ignored" };
  }

  const timestamp = dependencies.now();
  const localUpdates: Promise<unknown>[] = [
    settle(dependencies.markInboxMessageRead(result.data.notificationId, timestamp)),
  ];

  if (input.action) {
    localUpdates.push(
      settle(dependencies.markInboxMessageActioned(result.data.notificationId, timestamp)),
    );
  }

  await Promise.all([
    ...localUpdates,
    settle(
      dependencies.broadcast(
        createNotificationEventMessage("clicked", result.data.notificationId, targetUrl),
      ),
    ),
    settle(
      dependencies.focusOrOpen(targetUrl, () =>
        dependencies.savePendingClickEvent({
          actionId: input.action || undefined,
          notificationId: result.data.notificationId,
          targetUrl,
        }),
      ),
    ),
    settle(
      sendClickAckOrQueue(
        {
          actionId: input.action || undefined,
          notificationId: result.data.notificationId,
          targetUrl,
          timestamp,
        },
        dependencies,
      ),
    ),
  ]);
  await settle(dependencies.flushQueuedAcks());

  return {
    notificationId: result.data.notificationId,
    status: "handled",
  };
}

function createNotificationOptions(payload: NotificationPayload): NotificationOptionsWithRenotify {
  const policy = getNotificationKindPolicy(payload.kind);

  return {
    body: payload.body,
    data: {
      kind: payload.kind,
      notificationId: payload.notificationId,
      targetUrl: payload.targetUrl,
      walletAddressTarget: payload.walletAddressTarget,
    },
    badge: "/logo192.png",
    icon: "/logo192.png",
    renotify: policy.renotify,
    silent: false,
    tag: `clc:${payload.kind}:${payload.walletAddressTarget ?? "device"}`,
  };
}

async function sendDeliveryAckOrQueue(
  input: Omit<SendNotificationDeliveryAckRequest, "deviceId">,
  dependencies: NotificationServiceWorkerDependencies,
): Promise<void> {
  const deviceId = await dependencies.getDeviceId();
  const request: SendNotificationDeliveryAckRequest = {
    ...input,
    deviceId,
  };

  try {
    await dependencies.sendDeliveryAck(request);
  } catch (error) {
    await dependencies.enqueueAck({
      deviceId,
      error: errorMessage(error),
      kind: "delivery",
      notificationId: request.notificationId,
      payload: request,
      walletAddress: request.walletAddressTarget,
    });
  }
}

async function sendClickAckOrQueue(
  input: Omit<SendNotificationClickAckRequest, "deviceId">,
  dependencies: NotificationServiceWorkerDependencies,
): Promise<void> {
  const deviceId = await dependencies.getDeviceId();
  const request: SendNotificationClickAckRequest = {
    ...input,
    deviceId,
  };
  const kind = request.actionId ? "action" : "click";

  try {
    await dependencies.sendClickAck(request);
  } catch (error) {
    await dependencies.enqueueAck({
      actionId: request.actionId,
      deviceId,
      error: errorMessage(error),
      kind,
      notificationId: request.notificationId,
      payload: request,
      targetUrl: request.targetUrl,
    });
  }
}

async function settle(promise: Promise<unknown>): Promise<void> {
  await promise.catch(() => undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
