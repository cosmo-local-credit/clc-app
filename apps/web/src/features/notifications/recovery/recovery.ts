import { z } from "zod";
import {
  type BackendInboxMessage,
  type NotificationClientOptions,
  sendNotificationClickAck,
  sendNotificationDeliveryAck,
  syncNotificationInbox,
} from "../api/notification-client";
import {
  deleteNotificationInboxMessages,
  isNotificationStorageAvailable,
  listQueuedNotificationAcks,
  type NotificationAckQueueEntry,
  type NotificationInboxMessage,
  readNotificationConfig,
  readNotificationDeviceId,
  removeQueuedNotificationAck,
  saveNotificationInboxMessage,
  updateNotificationAckAttempt,
  updateNotificationConfig,
} from "../storage/notification-db";
import { runNotificationSubscriptionHealthCheck } from "../subscription/health-check";

const MAX_ACK_ATTEMPTS = 5;
const MAX_ACK_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const deliveryAckSchema = z.object({
  deviceId: z.string().min(1),
  notificationId: z.string().min(1),
  platform: z.string().optional(),
  receivedAt: z.string().optional(),
  serviceWorkerVersion: z.string().optional(),
  shownAt: z.string().optional(),
  walletAddressTarget: z.string().optional(),
});

const clickAckSchema = z.object({
  actionId: z.string().optional(),
  deviceId: z.string().min(1),
  notificationId: z.string().min(1),
  targetUrl: z.string().optional(),
  timestamp: z.string().optional(),
});

export type NotificationAckFlushResult = {
  failed: number;
  pruned: number;
  sent: number;
};

export type NotificationInboxSyncResult =
  | {
      deleted: number;
      saved: number;
      status: "synced";
      syncCursor: string;
    }
  | {
      status: "skipped";
    };

export type RunNotificationRecoveryOptions = {
  client?: NotificationClientOptions;
  currentWalletAddress?: string;
  linkedWalletAddresses?: string[];
};

export async function runNotificationRecovery(
  options: RunNotificationRecoveryOptions = {},
): Promise<void> {
  if (!isNotificationStorageAvailable()) {
    return;
  }

  await runNotificationSubscriptionHealthCheck({
    client: options.client,
    currentWalletAddress: options.currentWalletAddress,
  }).catch(() => undefined);

  // Acks are device-scoped and always safe to drain. The inbox sync is not:
  // with no wallet to scope it to it pulls whatever the device is still linked
  // to and writes it into the store, which on a sign-out is the outgoing user's
  // messages landing back in an inbox that was just emptied. It also advances
  // `syncCursor`, so the next signed-in user's backlog would be skipped.
  await Promise.allSettled([
    flushQueuedNotificationAcks({ client: options.client }),
    ...(options.currentWalletAddress ? [syncNotificationInboxState(options)] : []),
  ]);
}

export async function flushQueuedNotificationAcks({
  client,
  now = new Date(),
}: {
  client?: NotificationClientOptions;
  now?: Date;
} = {}): Promise<NotificationAckFlushResult> {
  const entries = await listQueuedNotificationAcks();
  const result: NotificationAckFlushResult = {
    failed: 0,
    pruned: 0,
    sent: 0,
  };

  for (const entry of entries) {
    if (shouldPruneAck(entry, now)) {
      await removeQueuedNotificationAck(entry.ackId);
      result.pruned += 1;
      continue;
    }

    try {
      await sendQueuedAck(entry, client);
      await removeQueuedNotificationAck(entry.ackId);
      result.sent += 1;
    } catch (error) {
      const updated = await updateNotificationAckAttempt(entry.ackId, errorMessage(error));
      if (updated && updated.attemptCount >= MAX_ACK_ATTEMPTS) {
        await removeQueuedNotificationAck(entry.ackId);
        result.pruned += 1;
      } else {
        result.failed += 1;
      }
    }
  }

  return result;
}

export async function syncNotificationInboxState(
  options: RunNotificationRecoveryOptions = {},
): Promise<NotificationInboxSyncResult> {
  const deviceId = await readNotificationDeviceId();
  if (!deviceId) {
    return { status: "skipped" };
  }

  const config = await readNotificationConfig();
  const response = await syncNotificationInbox(
    {
      deviceId,
      lastSyncCursor: config?.syncCursor,
      linkedWalletAddresses: options.linkedWalletAddresses,
    },
    options.client,
  );

  for (const message of response.messages) {
    await saveNotificationInboxMessage(toLocalInboxMessage(message));
  }
  await deleteNotificationInboxMessages(response.deletedIds);
  await updateNotificationConfig({ syncCursor: response.nextSyncCursor });

  return {
    deleted: response.deletedIds.length,
    saved: response.messages.length,
    status: "synced",
    syncCursor: response.nextSyncCursor,
  };
}

async function sendQueuedAck(
  entry: NotificationAckQueueEntry,
  client?: NotificationClientOptions,
): Promise<void> {
  if (entry.kind === "delivery") {
    const request = deliveryAckSchema.parse(
      entry.payload ?? {
        deviceId: entry.deviceId,
        notificationId: entry.notificationId,
        walletAddressTarget: entry.walletAddress,
      },
    );
    const response = await sendNotificationDeliveryAck(request, client);
    if (!response.accepted) {
      throw new Error("Delivery acknowledgment was not accepted.");
    }
    return;
  }

  const request = clickAckSchema.parse(
    entry.payload ?? {
      actionId: entry.actionId,
      deviceId: entry.deviceId,
      notificationId: entry.notificationId,
      targetUrl: entry.targetUrl,
    },
  );
  const response = await sendNotificationClickAck(request, client);
  if (!response.accepted) {
    throw new Error("Click acknowledgment was not accepted.");
  }
}

function shouldPruneAck(entry: NotificationAckQueueEntry, now: Date): boolean {
  if (entry.attemptCount >= MAX_ACK_ATTEMPTS) {
    return true;
  }

  const queuedAt = Date.parse(entry.queuedAt);
  return !Number.isFinite(queuedAt) || now.getTime() - queuedAt > MAX_ACK_AGE_MS;
}

function toLocalInboxMessage(message: BackendInboxMessage): NotificationInboxMessage {
  const {
    actionId,
    clickedAt,
    deviceId: _deviceId,
    pushError: _pushError,
    pushStatus: _pushStatus,
    pushStatusCode: _pushStatusCode,
    receivedAt,
    recordId: _recordId,
    revision: _revision,
    sentAt,
    shownAt,
    ...payload
  } = message;

  return {
    ...payload,
    actionedAt: actionId && clickedAt ? clickedAt : undefined,
    rawPayload: message,
    readAt: clickedAt,
    receivedAt: receivedAt ?? shownAt ?? sentAt,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
