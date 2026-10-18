import { z } from "zod";
import { BRAND_ICON_BASE } from "#/lib/brand";
import type {
  SendNotificationClickAckRequest,
  SendNotificationDeliveryAckRequest,
} from "../api/notification-client";
import {
  type NotificationPayload,
  notificationKindSchema,
  parseNotificationPayload,
} from "../logic/payload-schema";
import { normalizeNotificationTargetUrl } from "../logic/target-url";
import type {
  EnqueueNotificationAckInput,
  NotificationInboxMessage,
  NotificationConfigRecord,
  NotificationPendingClickEvent,
} from "../storage/notification-db";
import {
  createNotificationBadgeMessage,
  createNotificationEventMessage,
  type NotificationWorkerMessage,
} from "./protocol";

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
  focusOrOpen: (
    targetUrl: string,
    beforeOpen: () => Promise<unknown>,
    identityEpoch?: string,
  ) => Promise<unknown>;
  getDeviceId: () => Promise<string>;
  readConfig: () => Promise<NotificationConfigRecord | null>;
  readDisplayState: (
    notificationId: string,
  ) => Promise<{ message: NotificationInboxMessage | null; deleted: boolean }>;
  markInboxMessageShown: (
    notificationId: string,
    at: string,
    identityEpoch?: string,
  ) => Promise<unknown>;
  dismissNotification: (notificationId: string, registrationId: string) => Promise<unknown>;
  isIdentityCurrent: (identityEpoch: string | undefined) => Promise<boolean>;
  markInboxMessageActioned: (
    notificationId: string,
    at: string,
    identityEpoch?: string,
  ) => Promise<unknown>;
  markInboxMessageRead: (
    notificationId: string,
    at: string,
    identityEpoch?: string,
  ) => Promise<unknown>;
  now: () => string;
  saveInboxMessage: (message: NotificationInboxMessage, identityEpoch?: string) => Promise<unknown>;
  savePendingClickEvent: (
    event: Omit<NotificationPendingClickEvent, "createdAt" | "eventId">,
    identityEpoch?: string,
  ) => Promise<unknown>;
  sendClickAck: (
    request: SendNotificationClickAckRequest,
    options?: { identityEpoch?: string },
  ) => Promise<unknown>;
  sendDeliveryAck: (
    request: SendNotificationDeliveryAckRequest,
    options?: { identityEpoch?: string },
  ) => Promise<unknown>;
  showNotification: (title: string, options: NotificationOptions) => Promise<unknown>;
  matchWindowClients: () => Promise<Array<{ visibilityState: string }>>;
  incrementUnseenCount: (identityEpoch: string) => Promise<number | null>;
  setAppBadge: (count: number) => Promise<unknown>;
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
  registrationId: z.string().min(1),
  identityEpoch: z.string().min(1),
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

  const envelope = z
    .object({
      registrationId: z.string().min(1),
      deliveryExpiresAt: z.string().datetime({ offset: true }),
    })
    .safeParse(rawPayload);
  const identity = await dependencies.readConfig();
  if (
    !envelope.success ||
    !identity?.identityEpoch ||
    !identity.userId ||
    identity.registrationId !== envelope.data.registrationId ||
    Date.parse(envelope.data.deliveryExpiresAt) <= Date.parse(dependencies.now())
  )
    return { status: "ignored" };
  const target = result.payload.walletAddressTarget?.toLowerCase();
  if (target && target !== identity.identityWallet?.toLowerCase()) return { status: "ignored" };
  const display = await dependencies.readDisplayState(result.payload.notificationId);
  if (
    display.deleted ||
    display.message?.readAt ||
    display.message?.shownAt ||
    display.message?.actionedAt
  )
    return { status: "ignored" };
  const receivedAt = dependencies.now();
  const message: NotificationInboxMessage = {
    ...result.payload,
    rawPayload: result.rawPayload,
    receivedAt,
  };
  const persistence = settle(dependencies.saveInboxMessage(message, identity.identityEpoch));

  try {
    const beforeDisplay = await dependencies.readConfig();
    if (
      !(await dependencies.isIdentityCurrent(identity.identityEpoch)) ||
      beforeDisplay?.registrationId !== envelope.data.registrationId
    )
      return { status: "ignored" };
    await dependencies.showNotification(
      result.payload.title,
      createNotificationOptions(result.payload, identity),
    );
  } catch (error) {
    await persistence;
    throw error;
  }

  const afterDisplay = await dependencies.readConfig();
  if (
    !(await dependencies.isIdentityCurrent(identity.identityEpoch)) ||
    afterDisplay?.registrationId !== envelope.data.registrationId
  ) {
    await dependencies.dismissNotification(
      result.payload.notificationId,
      envelope.data.registrationId,
    );
    await persistence;
    return { status: "ignored" };
  }
  await settle(syncBackgroundBadge(dependencies, identity.identityEpoch));
  const shownAt = dependencies.now();
  await settle(
    dependencies.markInboxMessageShown(
      result.payload.notificationId,
      shownAt,
      identity.identityEpoch,
    ),
  );
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
        identity,
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

  const identity = await dependencies.readConfig();
  if (
    !identity?.identityEpoch ||
    result.data.identityEpoch !== identity.identityEpoch ||
    result.data.registrationId !== identity.registrationId ||
    !identity.userId
  )
    return { status: "ignored" };

  const targetUrl = normalizeNotificationTargetUrl(result.data.targetUrl, dependencies.appOrigin);
  if (!targetUrl) {
    return { status: "ignored" };
  }

  const timestamp = dependencies.now();
  const localUpdates: Promise<unknown>[] = [
    settle(
      dependencies.markInboxMessageRead(
        result.data.notificationId,
        timestamp,
        identity.identityEpoch,
      ),
    ),
  ];

  if (input.action) {
    localUpdates.push(
      settle(
        dependencies.markInboxMessageActioned(
          result.data.notificationId,
          timestamp,
          identity.identityEpoch,
        ),
      ),
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
      dependencies.focusOrOpen(
        targetUrl,
        () =>
          dependencies.savePendingClickEvent(
            {
              actionId: input.action || undefined,
              notificationId: result.data.notificationId,
              targetUrl,
            },
            identity.identityEpoch,
          ),
        identity.identityEpoch,
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
        identity,
      ),
    ),
  ]);
  await settle(dependencies.flushQueuedAcks());

  return {
    notificationId: result.data.notificationId,
    status: "handled",
  };
}

function createNotificationOptions(
  payload: NotificationPayload,
  identity: NotificationConfigRecord,
): NotificationOptionsWithRenotify {
  return {
    body: payload.body,
    data: {
      registrationId: identity.registrationId,
      identityEpoch: identity.identityEpoch,
      kind: payload.kind,
      notificationId: payload.notificationId,
      targetUrl: payload.targetUrl,
      walletAddressTarget: payload.walletAddressTarget,
    },
    badge: "/notification-badge.png",
    icon: `${BRAND_ICON_BASE}/icon-192.png`,
    // A retry of this notification replaces the tray entry without a second alert.
    renotify: false,
    silent: false,
    tag: `clc:${payload.notificationId}`,
  };
}

async function syncBackgroundBadge(
  dependencies: NotificationServiceWorkerDependencies,
  identityEpoch: string,
): Promise<void> {
  if (!(await dependencies.isIdentityCurrent(identityEpoch))) return;
  const clients = await dependencies.matchWindowClients();
  if (clients.some((client) => client.visibilityState === "visible")) return;
  const count = await dependencies.incrementUnseenCount(identityEpoch);
  if (count === null) return;
  try {
    await dependencies.setAppBadge(count);
  } catch {
    // Most browsers have no app-badge API. The push still stands.
  }
  await dependencies.broadcast(createNotificationBadgeMessage(count));
}

async function sendDeliveryAckOrQueue(
  input: Omit<SendNotificationDeliveryAckRequest, "deviceId">,
  dependencies: NotificationServiceWorkerDependencies,
  identity: NotificationConfigRecord,
): Promise<void> {
  if (!(await dependencies.isIdentityCurrent(identity.identityEpoch))) return;
  const deviceId = await dependencies.getDeviceId();
  const request: SendNotificationDeliveryAckRequest = {
    ...input,
    registrationId: identity.registrationId,
    deviceId,
  };

  try {
    await dependencies.sendDeliveryAck(request, { identityEpoch: identity.identityEpoch });
  } catch (error) {
    await dependencies.enqueueAck({
      identityEpoch: identity.identityEpoch,
      registrationId: identity.registrationId,
      userId: identity.userId,
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
  identity: NotificationConfigRecord,
): Promise<void> {
  if (!(await dependencies.isIdentityCurrent(identity.identityEpoch))) return;
  const deviceId = await dependencies.getDeviceId();
  const request: SendNotificationClickAckRequest = {
    ...input,
    registrationId: identity.registrationId,
    deviceId,
  };
  const kind = request.actionId ? "action" : "click";

  try {
    await dependencies.sendClickAck(request, { identityEpoch: identity.identityEpoch });
  } catch (error) {
    await dependencies.enqueueAck({
      identityEpoch: identity.identityEpoch,
      registrationId: identity.registrationId,
      userId: identity.userId,
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
