import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { NotificationPayload } from "../logic/payload-schema";
import type {
  NotificationCapabilityPlatform,
  NotificationPermissionSnapshot,
} from "../platform/capability";

const DB_NAME = "clc-notifications";
const DB_VERSION = 2;
const SINGLETON_KEY = "current";
const DEFAULT_ACK_LIMIT = 100;
const DEFAULT_DIAGNOSTIC_LIMIT = 50;

type NotificationDatabase = DBSchema & {
  ackQueue: {
    indexes: {
      "by-kind": NotificationAckKind;
      "by-notification-id": string;
      "by-queued-at": string;
    };
    key: string;
    value: NotificationAckQueueEntry;
  };
  config: {
    key: string;
    value: NotificationConfigRecord;
  };
  device: {
    key: string;
    value: NotificationDeviceRecord;
  };
  inbox: {
    indexes: {
      "by-created-at": string;
      "by-received-at": string;
      "by-wallet-address": string;
    };
    key: string;
    value: NotificationInboxMessage;
  };
  pendingClickEvents: {
    indexes: {
      "by-created-at": string;
    };
    key: string;
    value: NotificationPendingClickEvent;
  };
  subscriptionDiagnostics: {
    indexes: {
      "by-created-at": string;
      "by-status": NotificationSubscriptionDiagnosticStatus;
    };
    key: string;
    value: NotificationSubscriptionDiagnostic;
  };
};

export type NotificationDeviceRecord = {
  createdAt: string;
  deviceId: string;
  key: typeof SINGLETON_KEY;
  updatedAt: string;
};

export type NotificationConfigRecord = {
  appVersion?: string;
  key: typeof SINGLETON_KEY;
  permissionState?: NotificationPermissionSnapshot;
  platform?: NotificationCapabilityPlatform;
  serviceWorkerVersion?: string;
  subscriptionHash?: string;
  syncCursor?: string;
  updatedAt: string;
  vapidKeyVersion?: string;
  vapidPublicKey?: string;
  workerProtocolVersion?: number;
};

export type NotificationConfigPatch = Omit<Partial<NotificationConfigRecord>, "key" | "updatedAt">;

export type NotificationInboxMessage = NotificationPayload & {
  actionedAt?: string;
  readAt?: string;
  receivedAt: string;
  rawPayload?: unknown;
};

export type NotificationPendingClickEvent = {
  actionId?: string;
  createdAt: string;
  eventId: string;
  notificationId: string;
  targetUrl: string;
};

export type NotificationAckKind = "action" | "click" | "delivery";

export type NotificationAckQueueEntry = {
  ackId: string;
  actionId?: string;
  attemptCount: number;
  deviceId: string;
  error?: string;
  kind: NotificationAckKind;
  notificationId: string;
  payload?: unknown;
  queuedAt: string;
  targetUrl?: string;
  updatedAt: string;
  walletAddress?: string;
};

export type EnqueueNotificationAckInput = Omit<
  Partial<NotificationAckQueueEntry>,
  "ackId" | "attemptCount" | "queuedAt" | "updatedAt"
> &
  Pick<NotificationAckQueueEntry, "deviceId" | "kind" | "notificationId">;

export type NotificationSubscriptionDiagnosticStatus =
  | "active"
  | "failed"
  | "missing"
  | "refreshed"
  | "stale";

export type NotificationSubscriptionDiagnostic = {
  code?: number;
  createdAt: string;
  diagnosticId: string;
  endpoint?: string;
  error?: string;
  status: NotificationSubscriptionDiagnosticStatus;
  vapidKeyVersion?: string;
};

export type RecordSubscriptionDiagnosticInput = Omit<
  Partial<NotificationSubscriptionDiagnostic>,
  "createdAt" | "diagnosticId"
> &
  Pick<NotificationSubscriptionDiagnostic, "status">;

let databasePromise: Promise<IDBPDatabase<NotificationDatabase>> | null = null;
let lastAckQueuedAtMs = 0;

export async function resetNotificationDatabaseForTests(): Promise<void> {
  const database = await databasePromise?.catch(() => null);
  database?.close();
  databasePromise = null;
  lastAckQueuedAtMs = 0;
}

export function isNotificationStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function getOrCreateNotificationDeviceId(): Promise<string> {
  const db = await openNotificationDatabase();
  const existing = await db.get("device", SINGLETON_KEY);

  if (existing) {
    return existing.deviceId;
  }

  const now = nowISO();
  const record: NotificationDeviceRecord = {
    createdAt: now,
    deviceId: createId("device"),
    key: SINGLETON_KEY,
    updatedAt: now,
  };

  await db.put("device", record);
  return record.deviceId;
}

export async function readNotificationDeviceId(): Promise<string | null> {
  const db = await openNotificationDatabase();
  const record = await db.get("device", SINGLETON_KEY);
  return record?.deviceId ?? null;
}

export async function readNotificationConfig(): Promise<NotificationConfigRecord | null> {
  const db = await openNotificationDatabase();
  return (await db.get("config", SINGLETON_KEY)) ?? null;
}

export async function updateNotificationConfig(
  patch: NotificationConfigPatch,
): Promise<NotificationConfigRecord> {
  const db = await openNotificationDatabase();
  const current = await db.get("config", SINGLETON_KEY);
  const next: NotificationConfigRecord = {
    ...current,
    ...patch,
    key: SINGLETON_KEY,
    updatedAt: nowISO(),
  };

  await db.put("config", next);
  return next;
}

export async function saveNotificationInboxMessage(
  message: NotificationInboxMessage,
): Promise<NotificationInboxMessage> {
  const db = await openNotificationDatabase();
  const current = await db.get("inbox", message.notificationId);
  const next: NotificationInboxMessage = {
    ...current,
    ...message,
    receivedAt: message.receivedAt || current?.receivedAt || nowISO(),
  };

  await db.put("inbox", next);
  return next;
}

export async function listNotificationInboxMessages(
  limit = 50,
): Promise<NotificationInboxMessage[]> {
  const db = await openNotificationDatabase();
  const messages = await db.getAll("inbox");

  return messages
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
    .slice(0, limit);
}

export async function getNotificationInboxMessage(
  notificationId: string,
): Promise<NotificationInboxMessage | null> {
  const db = await openNotificationDatabase();
  return (await db.get("inbox", notificationId)) ?? null;
}

export async function deleteNotificationInboxMessages(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) {
    return;
  }

  const db = await openNotificationDatabase();
  const transaction = db.transaction("inbox", "readwrite");

  await Promise.all([
    ...notificationIds.map((notificationId) => transaction.store.delete(notificationId)),
    transaction.done,
  ]);
}

export async function markNotificationInboxMessageRead(
  notificationId: string,
  readAt = nowISO(),
): Promise<NotificationInboxMessage | null> {
  const db = await openNotificationDatabase();
  const current = await db.get("inbox", notificationId);
  if (!current) {
    return null;
  }

  const next: NotificationInboxMessage = { ...current, readAt };
  await db.put("inbox", next);
  return next;
}

export async function markNotificationInboxMessageActioned(
  notificationId: string,
  actionedAt = nowISO(),
): Promise<NotificationInboxMessage | null> {
  const db = await openNotificationDatabase();
  const current = await db.get("inbox", notificationId);
  if (!current) {
    return null;
  }

  const next: NotificationInboxMessage = { ...current, actionedAt };
  await db.put("inbox", next);
  return next;
}

export async function savePendingNotificationClickEvent(
  event: Omit<NotificationPendingClickEvent, "createdAt" | "eventId">,
): Promise<NotificationPendingClickEvent> {
  const db = await openNotificationDatabase();
  const pendingEvent: NotificationPendingClickEvent = {
    ...event,
    createdAt: nowISO(),
    eventId: createId("notification-click"),
  };

  await db.put("pendingClickEvents", pendingEvent);
  return pendingEvent;
}

export async function consumePendingNotificationClickEvents(): Promise<
  NotificationPendingClickEvent[]
> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction("pendingClickEvents", "readwrite");
  const events = await transaction.store.getAll();
  await transaction.store.clear();
  await transaction.done;

  return events.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function enqueueNotificationAck(
  input: EnqueueNotificationAckInput,
): Promise<NotificationAckQueueEntry> {
  const db = await openNotificationDatabase();
  const now = nextAckTimestamp();
  const entry: NotificationAckQueueEntry = {
    ...input,
    ackId: createId(`ack-${input.kind}`),
    attemptCount: 0,
    queuedAt: now,
    updatedAt: now,
  };

  await db.put("ackQueue", entry);
  return entry;
}

export async function listQueuedNotificationAcks(
  limit = DEFAULT_ACK_LIMIT,
): Promise<NotificationAckQueueEntry[]> {
  const db = await openNotificationDatabase();
  const entries = await db.getAll("ackQueue");

  return entries.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt)).slice(0, limit);
}

export async function updateNotificationAckAttempt(
  ackId: string,
  error?: string,
): Promise<NotificationAckQueueEntry | null> {
  const db = await openNotificationDatabase();
  const current = await db.get("ackQueue", ackId);
  if (!current) {
    return null;
  }

  const next: NotificationAckQueueEntry = {
    ...current,
    attemptCount: current.attemptCount + 1,
    error,
    updatedAt: nowISO(),
  };

  await db.put("ackQueue", next);
  return next;
}

export async function removeQueuedNotificationAck(ackId: string): Promise<void> {
  const db = await openNotificationDatabase();
  await db.delete("ackQueue", ackId);
}

export async function clearQueuedNotificationAcks(): Promise<void> {
  const db = await openNotificationDatabase();
  await db.clear("ackQueue");
}

export async function recordSubscriptionDiagnostic(
  input: RecordSubscriptionDiagnosticInput,
): Promise<NotificationSubscriptionDiagnostic> {
  const db = await openNotificationDatabase();
  const diagnostic: NotificationSubscriptionDiagnostic = {
    ...input,
    createdAt: nowISO(),
    diagnosticId: createId(`subscription-${input.status}`),
  };

  await db.put("subscriptionDiagnostics", diagnostic);
  return diagnostic;
}

export async function listSubscriptionDiagnostics(
  limit = DEFAULT_DIAGNOSTIC_LIMIT,
): Promise<NotificationSubscriptionDiagnostic[]> {
  const db = await openNotificationDatabase();
  const diagnostics = await db.getAll("subscriptionDiagnostics");

  return diagnostics
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function openNotificationDatabase(): Promise<IDBPDatabase<NotificationDatabase>> {
  if (!isNotificationStorageAvailable()) {
    throw new Error("IndexedDB is not available in this environment.");
  }

  databasePromise ??= openDB<NotificationDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("device")) {
        db.createObjectStore("device", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("config")) {
        db.createObjectStore("config", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("inbox")) {
        const inbox = db.createObjectStore("inbox", {
          keyPath: "notificationId",
        });
        inbox.createIndex("by-created-at", "createdAt");
        inbox.createIndex("by-received-at", "receivedAt");
        inbox.createIndex("by-wallet-address", "walletAddressTarget");
      }

      if (!db.objectStoreNames.contains("ackQueue")) {
        const ackQueue = db.createObjectStore("ackQueue", {
          keyPath: "ackId",
        });
        ackQueue.createIndex("by-kind", "kind");
        ackQueue.createIndex("by-notification-id", "notificationId");
        ackQueue.createIndex("by-queued-at", "queuedAt");
      }

      if (!db.objectStoreNames.contains("pendingClickEvents")) {
        const pendingClickEvents = db.createObjectStore("pendingClickEvents", {
          keyPath: "eventId",
        });
        pendingClickEvents.createIndex("by-created-at", "createdAt");
      }

      if (!db.objectStoreNames.contains("subscriptionDiagnostics")) {
        const diagnostics = db.createObjectStore("subscriptionDiagnostics", {
          keyPath: "diagnosticId",
        });
        diagnostics.createIndex("by-created-at", "createdAt");
        diagnostics.createIndex("by-status", "status");
      }
    },
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function createId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}-${id}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function nextAckTimestamp(): string {
  const timestamp = Math.max(Date.now(), lastAckQueuedAtMs + 1);
  lastAckQueuedAtMs = timestamp;
  return new Date(timestamp).toISOString();
}
