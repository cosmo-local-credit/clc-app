import { describe, expect, it, vi } from "vite-plus/test";
import type {
  SendNotificationClickAckRequest,
  SendNotificationDeliveryAckRequest,
} from "../api/notification-client";
import type {
  EnqueueNotificationAckInput,
  NotificationInboxMessage,
} from "../storage/notification-db";
import {
  handleNotificationClick,
  handleNotificationPush,
  type NotificationClickInput,
  type NotificationServiceWorkerDependencies,
} from "./handlers";

const APP_ORIGIN = "https://app.cosmolocal.credit";
const NOW = "2026-06-10T12:00:00.000Z";
const WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

const validPayload = {
  body: "You received a voucher.",
  createdAt: "2026-06-10T11:59:00.000Z",
  kind: "voucher.received",
  notificationId: "notification-1",
  priority: "high",
  targetUrl: "/wallet",
  title: "Voucher received",
  walletAddressTarget: WALLET_ADDRESS,
} as const;

describe("handleNotificationPush", () => {
  it("persists, displays, broadcasts, and acknowledges a valid payload", async () => {
    const { dependencies, spies } = createDependencies();

    await expect(handleNotificationPush(validPayload, dependencies)).resolves.toEqual({
      notificationId: "notification-1",
      status: "displayed",
    });

    expect(spies.saveInboxMessage).toHaveBeenCalledWith({
      ...validPayload,
      rawPayload: validPayload,
      receivedAt: NOW,
    });
    expect(spies.showNotification).toHaveBeenCalledWith(
      "Voucher received",
      expect.objectContaining({
        body: "You received a voucher.",
        data: {
          kind: "voucher.received",
          notificationId: "notification-1",
          targetUrl: "/wallet",
          walletAddressTarget: WALLET_ADDRESS,
        },
        icon: "/logo192.png",
        renotify: true,
        tag: `clc:voucher.received:${WALLET_ADDRESS}`,
      }),
    );
    expect(spies.broadcast).toHaveBeenCalledWith({
      event: "delivered",
      notificationId: "notification-1",
      protocolVersion: 1,
      type: "notification:event",
    });
    expect(spies.sendDeliveryAck).toHaveBeenCalledWith({
      deviceId: "device-1",
      notificationId: "notification-1",
      receivedAt: NOW,
      shownAt: NOW,
      walletAddressTarget: WALLET_ADDRESS,
    });
    expect(spies.enqueueAck).not.toHaveBeenCalled();
  });

  it("shows a required-fields-only notification when optional metadata is malformed", async () => {
    const { dependencies, spies } = createDependencies();
    const rawPayload = {
      ...validPayload,
      actions: [{ action: "", title: "" }],
      voucherId: 42,
    };

    await expect(handleNotificationPush(rawPayload, dependencies)).resolves.toMatchObject({
      status: "displayed",
    });

    expect(spies.saveInboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: validPayload.body,
        notificationId: validPayload.notificationId,
        rawPayload,
        title: validPayload.title,
      }),
    );
    const persisted = spies.saveInboxMessage.mock.calls[0]?.[0];
    expect(persisted).not.toHaveProperty("actions");
    expect(persisted).not.toHaveProperty("voucherId");
    expect(spies.showNotification).toHaveBeenCalledWith(
      validPayload.title,
      expect.objectContaining({ body: validPayload.body }),
    );
  });

  it("queues a failed delivery acknowledgment without blocking display", async () => {
    const { dependencies, spies } = createDependencies();
    spies.sendDeliveryAck.mockRejectedValueOnce(new Error("backend unavailable"));

    await expect(handleNotificationPush(validPayload, dependencies)).resolves.toMatchObject({
      status: "displayed",
    });

    expect(spies.showNotification).toHaveBeenCalledOnce();
    expect(spies.enqueueAck).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "device-1",
        error: "backend unavailable",
        kind: "delivery",
        notificationId: "notification-1",
        walletAddress: WALLET_ADDRESS,
      }),
    );
  });

  it("still displays when inbox persistence fails", async () => {
    const { dependencies, spies } = createDependencies();
    spies.saveInboxMessage.mockRejectedValueOnce(new Error("IndexedDB unavailable"));

    await expect(handleNotificationPush(validPayload, dependencies)).resolves.toMatchObject({
      status: "displayed",
    });

    expect(spies.showNotification).toHaveBeenCalledOnce();
    expect(spies.sendDeliveryAck).toHaveBeenCalledOnce();
  });

  it("ignores payloads with invalid required fields", async () => {
    const { dependencies, spies } = createDependencies();

    await expect(
      handleNotificationPush(
        {
          ...validPayload,
          targetUrl: "https://evil.example/wallet",
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "ignored" });

    expect(spies.saveInboxMessage).not.toHaveBeenCalled();
    expect(spies.showNotification).not.toHaveBeenCalled();
    expect(spies.sendDeliveryAck).not.toHaveBeenCalled();
  });
});

describe("handleNotificationClick", () => {
  it("closes, updates local state, focuses the target, and acknowledges the click", async () => {
    const { dependencies, spies } = createDependencies();
    const input = clickInput();

    await expect(handleNotificationClick(input, dependencies)).resolves.toEqual({
      notificationId: "notification-1",
      status: "handled",
    });

    expect(input.close).toHaveBeenCalledOnce();
    expect(spies.markInboxMessageRead).toHaveBeenCalledWith("notification-1", NOW);
    expect(spies.focusOrOpen).toHaveBeenCalledWith("/wallet", expect.any(Function));
    expect(spies.savePendingClickEvent).not.toHaveBeenCalled();
    expect(spies.broadcast).toHaveBeenCalledWith({
      event: "clicked",
      notificationId: "notification-1",
      protocolVersion: 1,
      targetUrl: "/wallet",
      type: "notification:event",
    });
    expect(spies.sendClickAck).toHaveBeenCalledWith({
      deviceId: "device-1",
      notificationId: "notification-1",
      targetUrl: "/wallet",
      timestamp: NOW,
    });
    expect(spies.enqueueAck).not.toHaveBeenCalled();
    expect(spies.flushQueuedAcks).toHaveBeenCalledOnce();
  });

  it("marks an action and queues a failed click acknowledgment", async () => {
    const { dependencies, spies } = createDependencies();
    spies.sendClickAck.mockRejectedValueOnce(new Error("offline"));

    await expect(
      handleNotificationClick(clickInput({ action: "view" }), dependencies),
    ).resolves.toMatchObject({ status: "handled" });

    expect(spies.markInboxMessageActioned).toHaveBeenCalledWith("notification-1", NOW);
    expect(spies.enqueueAck).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "view",
        deviceId: "device-1",
        error: "offline",
        kind: "action",
        notificationId: "notification-1",
        targetUrl: "/wallet",
      }),
    );
  });

  it("persists a delayed click before opening a new app window", async () => {
    const { dependencies, spies } = createDependencies();
    spies.focusOrOpen.mockImplementationOnce(async (_targetUrl, beforeOpen) => {
      await beforeOpen();
    });

    await handleNotificationClick(clickInput({ action: "view" }), dependencies);

    expect(spies.savePendingClickEvent).toHaveBeenCalledWith({
      actionId: "view",
      notificationId: "notification-1",
      targetUrl: "/wallet",
    });
  });

  it("closes but otherwise ignores invalid notification data", async () => {
    const { dependencies, spies } = createDependencies();
    const input = clickInput({
      data: {
        notificationId: "",
        targetUrl: "https://evil.example/wallet",
      },
    });

    await expect(handleNotificationClick(input, dependencies)).resolves.toEqual({
      status: "ignored",
    });

    expect(input.close).toHaveBeenCalledOnce();
    expect(spies.focusOrOpen).not.toHaveBeenCalled();
    expect(spies.sendClickAck).not.toHaveBeenCalled();
  });
});

function clickInput(overrides: Partial<NotificationClickInput> = {}): NotificationClickInput {
  return {
    action: "",
    close: vi.fn(),
    data: {
      kind: "voucher.received",
      notificationId: "notification-1",
      targetUrl: "/wallet",
      walletAddressTarget: WALLET_ADDRESS,
    },
    ...overrides,
  };
}

function createDependencies(): {
  dependencies: NotificationServiceWorkerDependencies;
  spies: ReturnType<typeof createSpies>;
} {
  const spies = createSpies();

  return {
    dependencies: {
      appOrigin: APP_ORIGIN,
      broadcast: spies.broadcast,
      enqueueAck: spies.enqueueAck,
      flushQueuedAcks: spies.flushQueuedAcks,
      focusOrOpen: spies.focusOrOpen,
      getDeviceId: spies.getDeviceId,
      markInboxMessageActioned: spies.markInboxMessageActioned,
      markInboxMessageRead: spies.markInboxMessageRead,
      now: () => NOW,
      saveInboxMessage: spies.saveInboxMessage,
      savePendingClickEvent: spies.savePendingClickEvent,
      sendClickAck: spies.sendClickAck,
      sendDeliveryAck: spies.sendDeliveryAck,
      showNotification: spies.showNotification,
    },
    spies,
  };
}

function createSpies() {
  return {
    broadcast: vi.fn<(message: unknown) => Promise<void>>().mockResolvedValue(),
    enqueueAck: vi
      .fn<(input: EnqueueNotificationAckInput) => Promise<unknown>>()
      .mockResolvedValue({}),
    focusOrOpen: vi
      .fn<(targetUrl: string, beforeOpen: () => Promise<unknown>) => Promise<void>>()
      .mockResolvedValue(),
    flushQueuedAcks: vi.fn<() => Promise<void>>().mockResolvedValue(),
    getDeviceId: vi.fn<() => Promise<string>>().mockResolvedValue("device-1"),
    markInboxMessageActioned: vi
      .fn<(notificationId: string, at: string) => Promise<unknown>>()
      .mockResolvedValue({}),
    markInboxMessageRead: vi
      .fn<(notificationId: string, at: string) => Promise<unknown>>()
      .mockResolvedValue({}),
    saveInboxMessage: vi
      .fn<(message: NotificationInboxMessage) => Promise<unknown>>()
      .mockResolvedValue({}),
    savePendingClickEvent: vi.fn().mockResolvedValue({}),
    sendClickAck: vi
      .fn<(request: SendNotificationClickAckRequest) => Promise<unknown>>()
      .mockResolvedValue({ accepted: true }),
    sendDeliveryAck: vi
      .fn<(request: SendNotificationDeliveryAckRequest) => Promise<unknown>>()
      .mockResolvedValue({ accepted: true }),
    showNotification: vi
      .fn<(title: string, options: NotificationOptions) => Promise<void>>()
      .mockResolvedValue(),
  };
}
