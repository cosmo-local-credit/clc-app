import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { NotificationPayload } from "../logic/payload-schema";
import type {
  NotificationCapabilityPlatform,
  NotificationPermissionSnapshot,
} from "../platform/capability";

const DB_NAME = "clc-notifications";
const DB_VERSION = 3;
const SINGLETON_KEY = "current";
export const NOTIFICATION_IDENTITY_EVENT = "clc-notification-identity";
const DEFAULT_ACK_LIMIT = 100;
const DEFAULT_DIAGNOSTIC_LIMIT = 50;

type NotificationDatabase = DBSchema & {
  inboxRevisions: { key: string; value: { notificationId: string; revision: number } };
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

type NotificationDeviceRecord = {
  createdAt: string;
  deviceId: string;
  installationToken: string;
  key: typeof SINGLETON_KEY;
  updatedAt: string;
};

export type NotificationConfigRecord = {
  identityEpoch?: string;
  identityWallet?: string;
  registrationId?: string;
  userId?: string;
  generation?: number;
  appVersion?: string;
  key: typeof SINGLETON_KEY;
  permissionState?: NotificationPermissionSnapshot;
  platform?: NotificationCapabilityPlatform;
  serviceWorkerVersion?: string;
  subscriptionHash?: string;
  syncCursor?: string;
  /** Notifications that arrived while no window was visible. */
  unseenCount?: number;
  updatedAt: string;
  vapidKeyVersion?: string;
  vapidPublicKey?: string;
  workerProtocolVersion?: number;
};

export type NotificationConfigPatch = Omit<Partial<NotificationConfigRecord>, "key" | "updatedAt">;

export type NotificationInboxMessage = NotificationPayload & {
  shownAt?: string;
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

type NotificationAckKind = "action" | "click" | "delivery";

export type NotificationAckQueueEntry = {
  identityEpoch?: string;
  registrationId?: string;
  userId?: string;
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

type NotificationSubscriptionDiagnosticStatus =
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

export async function getOrCreateNotificationInstallation(): Promise<NotificationDeviceRecord> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction("device", "readwrite");
  const existing = await transaction.store.get(SINGLETON_KEY);
  const now = nowISO();
  const record: NotificationDeviceRecord = {
    createdAt: now,
    deviceId: createId("device"),
    ...existing,
    installationToken:
      existing?.installationToken ??
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    key: SINGLETON_KEY,
    updatedAt: now,
  };
  await transaction.store.put(record);
  await transaction.done;
  return record;
}

export async function getOrCreateNotificationDeviceId(): Promise<string> {
  return (await getOrCreateNotificationInstallation()).deviceId;
}

export async function beginNotificationIdentity(
  walletAddress?: string,
  userId?: string,
): Promise<NotificationConfigRecord & { identityEpoch: string }> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction(
    ["config", "inbox", "inboxRevisions", "ackQueue", "pendingClickEvents"],
    "readwrite",
  );
  const store = transaction.objectStore("config");
  const current = await store.get(SINGLETON_KEY);
  const identityWallet = walletAddress?.toLowerCase();
  if (
    current?.identityEpoch &&
    current.identityWallet === identityWallet &&
    (userId === undefined || current.userId === undefined || current.userId === userId)
  ) {
    await transaction.done;
    return { ...current, identityEpoch: current.identityEpoch };
  }
  const next: NotificationConfigRecord & { identityEpoch: string } = {
    ...current,
    key: SINGLETON_KEY,
    identityWallet,
    identityEpoch: createId("epoch"),
    registrationId: undefined,
    userId: undefined,
    generation: undefined,
    syncCursor: undefined,
    unseenCount: 0,
    updatedAt: nowISO(),
  };
  await Promise.all([
    store.put(next),
    transaction.objectStore("inbox").clear(),
    transaction.objectStore("inboxRevisions").clear(),
    transaction.objectStore("ackQueue").clear(),
    transaction.objectStore("pendingClickEvents").clear(),
  ]);
  await transaction.done;
  broadcastNotificationIdentityChange();
  return next;
}

export async function isNotificationIdentityCurrent(
  identityEpoch: string | undefined,
): Promise<boolean> {
  return (
    identityEpoch !== undefined && (await readNotificationConfig())?.identityEpoch === identityEpoch
  );
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

/**
 * Adds one unseen notification. The read and the write share one transaction,
 * so two pushes cannot both store the same count. An old epoch writes nothing.
 */
export async function incrementUnseenCount(identityEpoch: string): Promise<number | null> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction("config", "readwrite");
  const current = await transaction.store.get(SINGLETON_KEY);
  if (current?.identityEpoch !== identityEpoch) {
    await transaction.done;
    return null;
  }
  const unseenCount = (current.unseenCount ?? 0) + 1;
  await transaction.store.put({ ...current, unseenCount });
  await transaction.done;
  return unseenCount;
}

/** Clears the unseen count for the current epoch. An old epoch writes nothing. */
export async function resetUnseenCount(identityEpoch: string): Promise<void> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction("config", "readwrite");
  const current = await transaction.store.get(SINGLETON_KEY);
  if (current?.identityEpoch !== identityEpoch) {
    await transaction.done;
    return;
  }
  await transaction.store.put({ ...current, unseenCount: 0 });
  await transaction.done;
}

export async function updateNotificationConfig(
  patch: NotificationConfigPatch,
  expectedEpoch?: string,
): Promise<NotificationConfigRecord> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction("config", "readwrite");
  const current = await transaction.store.get(SINGLETON_KEY);
  if (expectedEpoch !== undefined && current?.identityEpoch !== expectedEpoch) {
    await transaction.done;
    if (!current) throw new Error("Notification identity changed.");
    return current;
  }
  if (
    patch.generation !== undefined &&
    current?.generation !== undefined &&
    patch.generation < current.generation
  ) {
    await transaction.done;
    return current;
  }
  const next: NotificationConfigRecord = {
    ...current,
    ...patch,
    key: SINGLETON_KEY,
    updatedAt: nowISO(),
  };

  await transaction.store.put(next);
  await transaction.done;
  return next;
}

export async function saveNotificationInboxMessage(
  message: NotificationInboxMessage,
  expectedEpoch?: string,
): Promise<NotificationInboxMessage> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction(["inbox", "inboxRevisions", "config"], "readwrite");
  const config = await transaction.objectStore("config").get(SINGLETON_KEY);
  const store = transaction.objectStore("inbox");
  const current = await store.get(message.notificationId);
  const revision = await transaction.objectStore("inboxRevisions").get(message.notificationId);
  if (
    (expectedEpoch !== undefined && config?.identityEpoch !== expectedEpoch) ||
    (revision && (message.revision ?? -1) <= revision.revision)
  ) {
    await transaction.done;
    return current ?? message;
  }
  const next: NotificationInboxMessage = {
    ...current,
    ...message,
    receivedAt: message.receivedAt || current?.receivedAt || nowISO(),
    // Normalized here because this is the only write path into `inbox` (reached
    // from `recovery.ts` and `sw/register-handlers.ts`) and because the schema
    // that validates it, `logic/payload-schema.ts`, accepts either casing. A
    // mixed-case target would not match the address an owner is compared
    // against, so one person's notification could be filed under nobody.
    ...(message.walletAddressTarget
      ? { walletAddressTarget: message.walletAddressTarget.toLowerCase() }
      : {}),
  };

  await store.put(next);
  if (message.revision !== undefined)
    await transaction
      .objectStore("inboxRevisions")
      .put({ notificationId: message.notificationId, revision: message.revision });
  await transaction.done;
  return next;
}

/**
 * One wallet's inbox, newest first, plus the messages addressed to the device.
 *
 * This database is device-scoped and outlives the session that filled it, so on
 * a shared phone a plain `getAll` hands the current user every previous user's
 * notifications. `walletAddress` is what bounds that.
 *
 * Deliberately a scan and filter rather than a lookup through
 * `by-wallet-address`, even though that index exists. IndexedDB omits a record
 * whose indexed key path is `undefined`, and a device-level notification has no
 * `walletAddressTarget` at all — such rows are absent from the index entirely,
 * so an index lookup cannot return them and would silently drop every
 * device-wide message. Two passes over one store is not worth the false economy;
 * the index stays declared because removing it would need a version bump.
 */
export async function listNotificationInboxMessages(
  walletAddress: string,
  limit = 50,
): Promise<NotificationInboxMessage[]> {
  const db = await openNotificationDatabase();
  const messages = await db.getAll("inbox");
  const owner = walletAddress.toLowerCase();

  return messages
    .filter((message) => {
      const target = message.walletAddressTarget?.toLowerCase();
      return target === undefined || target === owner;
    })
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
    .slice(0, limit);
}

/**
 * Drops everything here that belongs to a person rather than to the device, for
 * use at an identity boundary.
 *
 * `device` and `subscriptionDiagnostics` survive deliberately, which is why this
 * is not a `deleteDB`. The `deviceId` is what the backend's device record is
 * keyed on: deleting it would orphan that record and mint a new device on every
 * account switch, so the push subscription would multiply rather than move.
 *
 * `config` survives but its `syncCursor` is reset. The cursor says how far the
 * inbox has been synced; keeping it while emptying the inbox would make the
 * backend treat the incoming user's backlog as already delivered.
 */
export async function clearNotificationIdentityStores(expectedWallet?: string): Promise<void> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction(
    ["inbox", "inboxRevisions", "ackQueue", "pendingClickEvents", "config"],
    "readwrite",
  );

  const configStore = transaction.objectStore("config");
  const config = await configStore.get(SINGLETON_KEY);
  if (
    expectedWallet !== undefined &&
    config?.identityWallet !== undefined &&
    config.identityWallet !== expectedWallet.toLowerCase()
  ) {
    await transaction.done;
    return;
  }

  await Promise.all([
    transaction.objectStore("inbox").clear(),
    transaction.objectStore("inboxRevisions").clear(),
    transaction.objectStore("ackQueue").clear(),
    transaction.objectStore("pendingClickEvents").clear(),
    ...(config
      ? [
          configStore.put({
            ...config,
            identityEpoch: createId("epoch"),
            identityWallet: undefined,
            registrationId: undefined,
            userId: undefined,
            generation: undefined,
            syncCursor: undefined,
            unseenCount: 0,
            updatedAt: nowISO(),
          }),
        ]
      : []),
    transaction.done,
  ]);
  broadcastNotificationIdentityChange();
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
  identityEpoch?: string,
): Promise<NotificationInboxMessage | null> {
  return updateInboxInteraction(notificationId, { readAt }, identityEpoch);
}

export async function markNotificationInboxMessageActioned(
  notificationId: string,
  actionedAt = nowISO(),
  identityEpoch?: string,
): Promise<NotificationInboxMessage | null> {
  return updateInboxInteraction(notificationId, { actionedAt }, identityEpoch);
}

async function updateInboxInteraction(
  notificationId: string,
  patch: { readAt?: string; actionedAt?: string; shownAt?: string },
  identityEpoch?: string,
): Promise<NotificationInboxMessage | null> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction(["config", "inbox"], "readwrite");
  const config = await transaction.objectStore("config").get(SINGLETON_KEY);
  const store = transaction.objectStore("inbox");
  const current = await store.get(notificationId);
  if (!current || (identityEpoch !== undefined && config?.identityEpoch !== identityEpoch)) {
    await transaction.done;
    return null;
  }
  const next = { ...current, ...patch };
  await store.put(next);
  await transaction.done;
  return next;
}

export async function savePendingNotificationClickEvent(
  event: Omit<NotificationPendingClickEvent, "createdAt" | "eventId">,
  identityEpoch?: string,
): Promise<NotificationPendingClickEvent> {
  const db = await openNotificationDatabase();
  const pendingEvent: NotificationPendingClickEvent = {
    ...event,
    createdAt: nowISO(),
    eventId: createId("notification-click"),
  };

  const transaction = db.transaction(["config", "pendingClickEvents"], "readwrite");
  const config = await transaction.objectStore("config").get(SINGLETON_KEY);
  if (identityEpoch === undefined || config?.identityEpoch === identityEpoch)
    await transaction.objectStore("pendingClickEvents").put(pendingEvent);
  await transaction.done;
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
  const transaction = db.transaction(["config", "ackQueue"], "readwrite");
  const config = await transaction.objectStore("config").get(SINGLETON_KEY);
  const now = nextAckTimestamp();
  const entry: NotificationAckQueueEntry = {
    ...input,
    ackId: createId(`ack-${input.kind}`),
    attemptCount: 0,
    queuedAt: now,
    updatedAt: now,
  };

  if (
    !input.identityEpoch ||
    (config?.identityEpoch === input.identityEpoch &&
      config.registrationId === input.registrationId)
  )
    await transaction.objectStore("ackQueue").put(entry);
  await transaction.done;
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
    createdAt: nextDiagnosticTimestamp(),
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
      if (!db.objectStoreNames.contains("inboxRevisions"))
        db.createObjectStore("inboxRevisions", { keyPath: "notificationId" });
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

let lastDiagnosticCreatedAtMs = 0;

function nextDiagnosticTimestamp(): string {
  const timestamp = Math.max(Date.now(), lastDiagnosticCreatedAtMs + 1);
  lastDiagnosticCreatedAtMs = timestamp;
  return new Date(timestamp).toISOString();
}

export async function applyNotificationInboxPage(
  identityEpoch: string,
  expectedCursor: string | undefined,
  page: {
    messages: NotificationInboxMessage[];
    deletions: Array<{ notificationId: string; revision: number }>;
    nextSyncCursor: string;
    resetRequired?: boolean;
  },
): Promise<boolean> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction(["config", "inbox", "inboxRevisions"], "readwrite");
  const configStore = transaction.objectStore("config");
  const config = await configStore.get(SINGLETON_KEY);
  if (config?.identityEpoch !== identityEpoch || config.syncCursor !== expectedCursor) {
    await transaction.done;
    return false;
  }
  const inbox = transaction.objectStore("inbox");
  const revisions = transaction.objectStore("inboxRevisions");
  if (page.resetRequired) {
    await inbox.clear();
    await revisions.clear();
  }
  for (const message of page.messages) {
    const revision = message.revision ?? 0;
    const previousRevision = await revisions.get(message.notificationId);
    if (previousRevision && previousRevision.revision >= revision) continue;
    const current = await inbox.get(message.notificationId);
    await inbox.put({
      ...current,
      ...message,
      readAt: message.readAt ?? current?.readAt,
      shownAt: message.shownAt ?? current?.shownAt,
      actionedAt: message.actionedAt ?? current?.actionedAt,
      walletAddressTarget: message.walletAddressTarget?.toLowerCase(),
    });
    await revisions.put({ notificationId: message.notificationId, revision });
  }
  for (const deletion of page.deletions) {
    const current = await revisions.get(deletion.notificationId);
    if (current && current.revision > deletion.revision) continue;
    await inbox.delete(deletion.notificationId);
    await revisions.put(deletion);
  }
  await configStore.put({ ...config, syncCursor: page.nextSyncCursor, updatedAt: nowISO() });
  await transaction.done;
  return true;
}

function broadcastNotificationIdentityChange(): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(NOTIFICATION_IDENTITY_EVENT);
      channel.postMessage({ type: "identity-changed" });
      channel.close();
    }
    if (typeof window !== "undefined")
      window.localStorage.setItem(NOTIFICATION_IDENTITY_EVENT, createId("identity-change"));
  } catch {
    /* IndexedDB remains the authority when broadcast is unavailable. */
  }
}

export async function markNotificationInboxMessageShown(
  notificationId: string,
  shownAt = nowISO(),
  identityEpoch?: string,
): Promise<NotificationInboxMessage | null> {
  return updateInboxInteraction(notificationId, { shownAt }, identityEpoch);
}

export async function readNotificationDisplayState(
  notificationId: string,
): Promise<{ message: NotificationInboxMessage | null; deleted: boolean }> {
  const db = await openNotificationDatabase();
  const transaction = db.transaction(["inbox", "inboxRevisions"], "readonly");
  const message = await transaction.objectStore("inbox").get(notificationId);
  const revision = await transaction.objectStore("inboxRevisions").get(notificationId);
  await transaction.done;
  return { message: message ?? null, deleted: !message && revision !== undefined };
}
