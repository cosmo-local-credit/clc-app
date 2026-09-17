import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { NotificationAckQueueEntry } from "../storage/notification-db";

const api = vi.hoisted(() => ({
  sendClickAck: vi.fn(),
  sendDeliveryAck: vi.fn(),
  syncInbox: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  deleteInboxMessages: vi.fn(),
  isAvailable: vi.fn(),
  listAcks: vi.fn(),
  readConfig: vi.fn(),
  readDeviceId: vi.fn(),
  removeAck: vi.fn(),
  saveInboxMessage: vi.fn(),
  updateAckAttempt: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock("../api/notification-client", () => ({
  sendNotificationClickAck: api.sendClickAck,
  sendNotificationDeliveryAck: api.sendDeliveryAck,
  syncNotificationInbox: api.syncInbox,
}));

vi.mock("../storage/notification-db", () => ({
  deleteNotificationInboxMessages: storage.deleteInboxMessages,
  isNotificationStorageAvailable: storage.isAvailable,
  listQueuedNotificationAcks: storage.listAcks,
  readNotificationConfig: storage.readConfig,
  readNotificationDeviceId: storage.readDeviceId,
  removeQueuedNotificationAck: storage.removeAck,
  saveNotificationInboxMessage: storage.saveInboxMessage,
  updateNotificationAckAttempt: storage.updateAckAttempt,
  updateNotificationConfig: storage.updateConfig,
}));

const { flushQueuedNotificationAcks, runNotificationRecovery, syncNotificationInboxState } =
  await import("./recovery");

beforeEach(() => {
  vi.clearAllMocks();
  api.sendClickAck.mockResolvedValue({ accepted: true });
  api.sendDeliveryAck.mockResolvedValue({ accepted: true });
  storage.deleteInboxMessages.mockResolvedValue(undefined);
  storage.isAvailable.mockReturnValue(true);
  storage.listAcks.mockResolvedValue([]);
  storage.readConfig.mockResolvedValue(null);
  storage.readDeviceId.mockResolvedValue("device-1");
  storage.removeAck.mockResolvedValue(undefined);
  storage.saveInboxMessage.mockResolvedValue({});
  storage.updateAckAttempt.mockResolvedValue(null);
  storage.updateConfig.mockResolvedValue({});
});

describe("flushQueuedNotificationAcks", () => {
  it("sends delivery and click acknowledgments and removes accepted entries", async () => {
    storage.listAcks.mockResolvedValue([
      ackEntry({
        ackId: "ack-delivery",
        kind: "delivery",
        payload: {
          deviceId: "device-1",
          notificationId: "notification-1",
          receivedAt: "2026-06-10T12:00:00.000Z",
        },
      }),
      ackEntry({
        ackId: "ack-click",
        actionId: "view",
        kind: "action",
        notificationId: "notification-2",
        payload: {
          actionId: "view",
          deviceId: "device-1",
          notificationId: "notification-2",
          targetUrl: "/wallet",
        },
      }),
    ]);

    await expect(
      flushQueuedNotificationAcks({ now: new Date("2026-06-11T12:00:00.000Z") }),
    ).resolves.toEqual({
      failed: 0,
      pruned: 0,
      sent: 2,
    });

    expect(api.sendDeliveryAck).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: "notification-1" }),
      undefined,
    );
    expect(api.sendClickAck).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: "view", notificationId: "notification-2" }),
      undefined,
    );
    expect(storage.removeAck).toHaveBeenCalledWith("ack-delivery");
    expect(storage.removeAck).toHaveBeenCalledWith("ack-click");
  });

  it("increments transient failures and prunes old or exhausted entries", async () => {
    storage.listAcks.mockResolvedValue([
      ackEntry({ ackId: "ack-old", queuedAt: "2026-05-01T12:00:00.000Z" }),
      ackEntry({ ackId: "ack-exhausted", attemptCount: 5 }),
      ackEntry({ ackId: "ack-retry" }),
    ]);
    api.sendDeliveryAck.mockRejectedValueOnce(new Error("offline"));
    storage.updateAckAttempt.mockResolvedValue(
      ackEntry({ ackId: "ack-retry", attemptCount: 1, error: "offline" }),
    );

    await expect(
      flushQueuedNotificationAcks({ now: new Date("2026-06-11T12:00:00.000Z") }),
    ).resolves.toEqual({
      failed: 1,
      pruned: 2,
      sent: 0,
    });

    expect(storage.updateAckAttempt).toHaveBeenCalledWith("ack-retry", "offline");
    expect(storage.removeAck).toHaveBeenCalledWith("ack-old");
    expect(storage.removeAck).toHaveBeenCalledWith("ack-exhausted");
  });

  it("prunes an entry when its final retry fails", async () => {
    storage.listAcks.mockResolvedValue([ackEntry({ ackId: "ack-final", attemptCount: 4 })]);
    api.sendDeliveryAck.mockRejectedValueOnce(new Error("still offline"));
    storage.updateAckAttempt.mockResolvedValue(
      ackEntry({ ackId: "ack-final", attemptCount: 5, error: "still offline" }),
    );

    await expect(flushQueuedNotificationAcks()).resolves.toEqual({
      failed: 0,
      pruned: 1,
      sent: 0,
    });
    expect(storage.removeAck).toHaveBeenCalledWith("ack-final");
  });
});

describe("syncNotificationInboxState", () => {
  it("skips sync when notification enrollment has no device id", async () => {
    storage.readDeviceId.mockResolvedValue(null);

    await expect(syncNotificationInboxState()).resolves.toEqual({ status: "skipped" });
    expect(api.syncInbox).not.toHaveBeenCalled();
  });

  it("merges backend messages, applies deletions, and stores the next cursor", async () => {
    storage.readConfig.mockResolvedValue({ syncCursor: "cursor-1" });
    api.syncInbox.mockResolvedValue({
      deletedIds: ["notification-deleted"],
      messages: [
        {
          actionId: "view",
          body: "Swap completed",
          clickedAt: "2026-06-11T12:02:00.000Z",
          createdAt: "2026-06-11T12:00:00.000Z",
          deviceId: "device-1",
          kind: "swap.completed",
          notificationId: "notification-1",
          priority: "normal",
          pushStatus: "sent",
          recordId: "record-1",
          revision: 2,
          sentAt: "2026-06-11T12:00:01.000Z",
          targetUrl: "/wallet",
          title: "Swap completed",
        },
      ],
      nextSyncCursor: "cursor-2",
    });

    await expect(
      syncNotificationInboxState({
        linkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
      }),
    ).resolves.toEqual({
      deleted: 1,
      saved: 1,
      status: "synced",
      syncCursor: "cursor-2",
    });

    expect(api.syncInbox).toHaveBeenCalledWith(
      {
        deviceId: "device-1",
        lastSyncCursor: "cursor-1",
        linkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
      },
      undefined,
    );
    expect(storage.saveInboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        actionedAt: "2026-06-11T12:02:00.000Z",
        notificationId: "notification-1",
        readAt: "2026-06-11T12:02:00.000Z",
        receivedAt: "2026-06-11T12:00:01.000Z",
      }),
    );
    expect(storage.deleteInboxMessages).toHaveBeenCalledWith(["notification-deleted"]);
    expect(storage.updateConfig).toHaveBeenCalledWith({ syncCursor: "cursor-2" });
  });
});

describe("runNotificationRecovery", () => {
  it("does nothing when IndexedDB is unavailable", async () => {
    storage.isAvailable.mockReturnValue(false);

    await runNotificationRecovery();

    expect(storage.listAcks).not.toHaveBeenCalled();
    expect(storage.readDeviceId).not.toHaveBeenCalled();
  });

  // With no wallet to scope it to, the sync pulls whatever the device is still
  // linked to and writes it into the inbox — on a sign-out, the outgoing user's
  // messages landing back in the store teardown just emptied. It also advances
  // `syncCursor`, which would skip the next user's backlog.
  it("does not sync the inbox when no wallet is signed in", async () => {
    await runNotificationRecovery();

    expect(api.syncInbox).not.toHaveBeenCalled();
    // Device-scoped acks are still drained.
    expect(storage.listAcks).toHaveBeenCalled();
  });

  it("syncs the inbox once a wallet is signed in", async () => {
    api.syncInbox.mockResolvedValue({
      deletedIds: [],
      messages: [],
      nextSyncCursor: "cursor-2",
    });

    await runNotificationRecovery({
      currentWalletAddress: "0xa316408425cf17f1827483dee621c6c3a9b5fad4",
      linkedWalletAddresses: ["0xa316408425cf17f1827483dee621c6c3a9b5fad4"],
    });

    expect(api.syncInbox).toHaveBeenCalledTimes(1);
  });
});

function ackEntry(overrides: Partial<NotificationAckQueueEntry> = {}): NotificationAckQueueEntry {
  return {
    ackId: "ack-delivery",
    attemptCount: 0,
    deviceId: "device-1",
    kind: "delivery",
    notificationId: "notification-1",
    queuedAt: "2026-06-10T12:00:00.000Z",
    updatedAt: "2026-06-10T12:00:00.000Z",
    ...overrides,
  };
}
