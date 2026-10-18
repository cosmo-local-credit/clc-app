import {
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { NotificationPayload } from "../logic/payload-schema";
import {
  applyNotificationInboxPage,
  beginNotificationIdentity,
  getOrCreateNotificationInstallation,
  clearNotificationIdentityStores,
  clearQueuedNotificationAcks,
  consumePendingNotificationClickEvents,
  deleteNotificationInboxMessages,
  enqueueNotificationAck,
  getNotificationInboxMessage,
  getOrCreateNotificationDeviceId,
  isNotificationStorageAvailable,
  listNotificationInboxMessages,
  listQueuedNotificationAcks,
  listSubscriptionDiagnostics,
  markNotificationInboxMessageActioned,
  markNotificationInboxMessageRead,
  type NotificationInboxMessage,
  openNotificationDatabase,
  readNotificationConfig,
  readNotificationDeviceId,
  recordSubscriptionDiagnostic,
  removeQueuedNotificationAck,
  resetNotificationDatabaseForTests,
  saveNotificationInboxMessage,
  savePendingNotificationClickEvent,
  updateNotificationAckAttempt,
  updateNotificationConfig,
} from "./notification-db";

const basePayload: NotificationPayload = {
  body: "Voucher received",
  createdAt: "2026-06-05T12:00:00.000Z",
  kind: "voucher.received",
  notificationId: "notification-1",
  priority: "high",
  targetUrl: "/wallet",
  title: "Voucher received",
  walletAddressTarget: "0x1234567890abcdef1234567890abcdef12345678",
};

beforeEach(async () => {
  await resetNotificationDatabaseForTests();
  vi.stubGlobal("IDBCursor", IDBCursor);
  vi.stubGlobal("IDBCursorWithValue", IDBCursorWithValue);
  vi.stubGlobal("IDBDatabase", IDBDatabase);
  vi.stubGlobal("IDBFactory", IDBFactory);
  vi.stubGlobal("IDBIndex", IDBIndex);
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("IDBObjectStore", IDBObjectStore);
  vi.stubGlobal("IDBOpenDBRequest", IDBOpenDBRequest);
  vi.stubGlobal("IDBRequest", IDBRequest);
  vi.stubGlobal("IDBTransaction", IDBTransaction);
  vi.stubGlobal("IDBVersionChangeEvent", IDBVersionChangeEvent);
  vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(async () => {
  await resetNotificationDatabaseForTests();
  vi.unstubAllGlobals();
});

describe("notification device storage", () => {
  it("creates a stable device id once and reuses it", async () => {
    const firstDeviceId = await getOrCreateNotificationDeviceId();
    const secondDeviceId = await getOrCreateNotificationDeviceId();

    expect(firstDeviceId).toMatch(/^device-/);
    expect(secondDeviceId).toBe(firstDeviceId);
    expect(await readNotificationDeviceId()).toBe(firstDeviceId);
  });
});

describe("notification config storage", () => {
  it("persists config values and preserves existing fields on update", async () => {
    await updateNotificationConfig({
      appVersion: "web-test",
      permissionState: "granted",
      serviceWorkerVersion: "/sw.js",
      syncCursor: "cursor-1",
      vapidKeyVersion: "vapid-v1",
    });

    await updateNotificationConfig({
      syncCursor: "cursor-2",
      subscriptionHash: "subscription-hash",
    });

    expect(await readNotificationConfig()).toMatchObject({
      appVersion: "web-test",
      key: "current",
      permissionState: "granted",
      serviceWorkerVersion: "/sw.js",
      subscriptionHash: "subscription-hash",
      syncCursor: "cursor-2",
      vapidKeyVersion: "vapid-v1",
    });
  });
});

describe("notification inbox storage", () => {
  it("stores, updates, lists, reads, and marks inbox messages", async () => {
    const olderMessage = inboxMessage({
      notificationId: "notification-older",
      receivedAt: "2026-06-05T12:00:00.000Z",
      title: "Older notification",
    });
    const newerMessage = inboxMessage({
      notificationId: "notification-newer",
      receivedAt: "2026-06-05T12:05:00.000Z",
      title: "Newer notification",
    });

    await saveNotificationInboxMessage(olderMessage);
    await saveNotificationInboxMessage(newerMessage);
    await saveNotificationInboxMessage({
      ...olderMessage,
      body: "Updated body",
      receivedAt: "2026-06-05T12:03:00.000Z",
    });

    expect(await getNotificationInboxMessage("notification-older")).toMatchObject({
      body: "Updated body",
      notificationId: "notification-older",
      receivedAt: "2026-06-05T12:03:00.000Z",
    });

    expect(
      (await listNotificationInboxMessages(basePayload.walletAddressTarget as string)).map(
        (message) => message.notificationId,
      ),
    ).toEqual(["notification-newer", "notification-older"]);

    expect(
      await markNotificationInboxMessageRead("notification-older", "2026-06-05T12:06:00.000Z"),
    ).toMatchObject({
      notificationId: "notification-older",
      readAt: "2026-06-05T12:06:00.000Z",
    });

    expect(
      await markNotificationInboxMessageActioned("notification-older", "2026-06-05T12:07:00.000Z"),
    ).toMatchObject({
      actionedAt: "2026-06-05T12:07:00.000Z",
      notificationId: "notification-older",
      readAt: "2026-06-05T12:06:00.000Z",
    });

    expect(await markNotificationInboxMessageRead("missing")).toBeNull();
    expect(await markNotificationInboxMessageActioned("missing")).toBeNull();

    await deleteNotificationInboxMessages(["notification-older"]);
    expect(await getNotificationInboxMessage("notification-older")).toBeNull();
    expect(await getNotificationInboxMessage("notification-newer")).not.toBeNull();
  });

  it("lists one wallet's messages and the device's, never another wallet's", async () => {
    const other = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    await saveNotificationInboxMessage(inboxMessage({ notificationId: "mine" }));
    await saveNotificationInboxMessage(
      inboxMessage({ notificationId: "theirs", walletAddressTarget: other }),
    );
    // No target at all: a device-level message, which belongs to whoever holds
    // the phone. Such a row has no entry in `by-wallet-address`, which is why
    // the read cannot be an index lookup.
    await saveNotificationInboxMessage(
      inboxMessage({ notificationId: "device-wide", walletAddressTarget: undefined }),
    );

    const mine = await listNotificationInboxMessages(basePayload.walletAddressTarget as string);
    expect(mine.map((message) => message.notificationId).sort()).toEqual(["device-wide", "mine"]);

    const theirs = await listNotificationInboxMessages(other);
    expect(theirs.map((message) => message.notificationId).sort()).toEqual([
      "device-wide",
      "theirs",
    ]);
  });

  it("lowercases the target on save so a mixed-case address still matches", async () => {
    const mixedCase = "0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd";
    await saveNotificationInboxMessage(
      inboxMessage({ notificationId: "mixed", walletAddressTarget: mixedCase }),
    );

    expect(await getNotificationInboxMessage("mixed")).toMatchObject({
      walletAddressTarget: mixedCase.toLowerCase(),
    });
    expect(
      (await listNotificationInboxMessages(mixedCase)).map((message) => message.notificationId),
    ).toEqual(["mixed"]);
  });

  it("clears one identity's rows on an identity change but keeps the device", async () => {
    const deviceId = await getOrCreateNotificationDeviceId();
    await updateNotificationConfig({ syncCursor: "cursor-9", vapidKeyVersion: "v3" });
    await saveNotificationInboxMessage(inboxMessage({ notificationId: "mine" }));
    await enqueueNotificationAck({
      deviceId,
      kind: "delivery",
      notificationId: "mine",
    });
    await savePendingNotificationClickEvent({
      notificationId: "mine",
      targetUrl: "/wallet",
    });

    await clearNotificationIdentityStores();

    expect(await listNotificationInboxMessages(basePayload.walletAddressTarget as string)).toEqual(
      [],
    );
    expect(await listQueuedNotificationAcks()).toEqual([]);
    expect(await consumePendingNotificationClickEvents()).toEqual([]);

    // The device record is what the backend keys its record on. Dropping it
    // would orphan that record and mint a new device on every account switch.
    expect(await readNotificationDeviceId()).toBe(deviceId);
    // The cursor must go with the inbox, or the backend treats the incoming
    // user's backlog as already delivered. The rest of config stays.
    expect(await readNotificationConfig()).toMatchObject({ vapidKeyVersion: "v3" });
    expect((await readNotificationConfig())?.syncCursor).toBeUndefined();
  });
});

describe("notification ack queue storage", () => {
  it("enqueues, updates, removes, and clears pending acks", async () => {
    const deliveryAck = await enqueueNotificationAck({
      deviceId: "device-1",
      kind: "delivery",
      notificationId: "notification-1",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });
    await waitForClockTick();
    const clickAck = await enqueueNotificationAck({
      actionId: "view",
      deviceId: "device-1",
      kind: "click",
      notificationId: "notification-2",
      targetUrl: "/wallet",
    });

    expect(deliveryAck).toMatchObject({
      attemptCount: 0,
      deviceId: "device-1",
      kind: "delivery",
      notificationId: "notification-1",
    });
    expect(clickAck.ackId).toMatch(/^ack-click-/);
    expect((await listQueuedNotificationAcks()).map((ack) => ack.ackId)).toEqual([
      deliveryAck.ackId,
      clickAck.ackId,
    ]);

    expect(await updateNotificationAckAttempt(deliveryAck.ackId, "network error")).toMatchObject({
      ackId: deliveryAck.ackId,
      attemptCount: 1,
      error: "network error",
    });
    expect(await updateNotificationAckAttempt("missing")).toBeNull();

    await removeQueuedNotificationAck(deliveryAck.ackId);
    expect((await listQueuedNotificationAcks()).map((ack) => ack.ackId)).toEqual([clickAck.ackId]);

    await clearQueuedNotificationAcks();
    expect(await listQueuedNotificationAcks()).toEqual([]);
  });
});

describe("pending notification click storage", () => {
  it("stores delayed clicks and consumes them once in creation order", async () => {
    const first = await savePendingNotificationClickEvent({
      notificationId: "notification-1",
      targetUrl: "/wallet",
    });
    await waitForClockTick();
    const second = await savePendingNotificationClickEvent({
      actionId: "view",
      notificationId: "notification-2",
      targetUrl: "/wallet/history",
    });

    expect(await consumePendingNotificationClickEvents()).toEqual([first, second]);
    expect(await consumePendingNotificationClickEvents()).toEqual([]);
  });
});

describe("notification subscription diagnostics storage", () => {
  it("records diagnostics newest first", async () => {
    const activeDiagnostic = await recordSubscriptionDiagnostic({
      endpoint: "https://push.example/subscription-1",
      status: "active",
      vapidKeyVersion: "vapid-v1",
    });
    await waitForClockTick();
    const failedDiagnostic = await recordSubscriptionDiagnostic({
      code: 410,
      error: "gone",
      status: "failed",
    });

    expect(activeDiagnostic.diagnosticId).toMatch(/^subscription-active-/);
    expect(
      (await listSubscriptionDiagnostics()).map((diagnostic) => diagnostic.diagnosticId),
    ).toEqual([failedDiagnostic.diagnosticId, activeDiagnostic.diagnosticId]);
  });
});

describe("notification storage availability", () => {
  it("reports unavailable storage and throws clearly", async () => {
    await resetNotificationDatabaseForTests();
    vi.stubGlobal("indexedDB", undefined);

    expect(isNotificationStorageAvailable()).toBe(false);
    await expect(openNotificationDatabase()).rejects.toThrow(
      "IndexedDB is not available in this environment.",
    );
  });

  it("retries opening the database after a cached open rejects", async () => {
    const newerDatabase = await openRawDatabase("clc-notifications", 4);
    newerDatabase.close();

    await expect(openNotificationDatabase()).rejects.toMatchObject({
      name: "VersionError",
    });

    await deleteRawDatabase("clc-notifications");

    const database = await openNotificationDatabase();
    expect(database.version).toBe(3);
  });
});

function inboxMessage(overrides: Partial<NotificationInboxMessage> = {}): NotificationInboxMessage {
  return {
    ...basePayload,
    receivedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

// Waits until the millisecond clock has moved, not merely for a 1ms timer: timers
// run on the monotonic clock and can fire before `Date.now()` ticks over, which
// left two records with one `createdAt` and their order to the random key.
async function waitForClockTick(): Promise<void> {
  const start = Date.now();
  while (Date.now() === start) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function openRawDatabase(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteRawDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

describe("notification ownership and feed consistency", () => {
  it("creates one cryptographic installation secret even under concurrent callers", async () => {
    const installations = await Promise.all(
      Array.from({ length: 10 }, () => getOrCreateNotificationInstallation()),
    );
    expect(new Set(installations.map((item) => item.deviceId)).size).toBe(1);
    expect(new Set(installations.map((item) => item.installationToken)).size).toBe(1);
    expect(installations[0]?.installationToken).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects writes and pages from the outgoing owner", async () => {
    const first = await beginNotificationIdentity("0xaaa");
    await updateNotificationConfig({
      registrationId: "registration-a",
      userId: "a",
      generation: 1,
    });
    const second = await beginNotificationIdentity("0xbbb");
    expect(second.identityEpoch).not.toBe(first.identityEpoch);
    await saveNotificationInboxMessage(inboxMessage(), first.identityEpoch);
    expect(
      await applyNotificationInboxPage(first.identityEpoch, undefined, {
        messages: [inboxMessage()],
        deletions: [],
        nextSyncCursor: "stale",
      }),
    ).toBe(false);
    expect(await getNotificationInboxMessage("notification-1")).toBeNull();
    expect((await readNotificationConfig())?.syncCursor).toBeUndefined();
  });
  it("commits each page and cursor atomically and keeps revisioned deletions", async () => {
    const identity = await beginNotificationIdentity("0xaaa");
    expect(
      await applyNotificationInboxPage(identity.identityEpoch, undefined, {
        messages: [inboxMessage({ revision: 4 })],
        deletions: [],
        nextSyncCursor: "page-1",
      }),
    ).toBe(true);
    expect(
      await applyNotificationInboxPage(identity.identityEpoch, undefined, {
        messages: [inboxMessage({ revision: 5 })],
        deletions: [],
        nextSyncCursor: "old-concurrent-page",
      }),
    ).toBe(false);
    expect(
      await applyNotificationInboxPage(identity.identityEpoch, "page-1", {
        messages: [],
        deletions: [{ notificationId: "notification-1", revision: 6 }],
        nextSyncCursor: "page-2",
      }),
    ).toBe(true);
    await saveNotificationInboxMessage(inboxMessage({ revision: 4 }), identity.identityEpoch);
    expect(await getNotificationInboxMessage("notification-1")).toBeNull();
    expect((await readNotificationConfig())?.syncCursor).toBe("page-2");
  });
});
