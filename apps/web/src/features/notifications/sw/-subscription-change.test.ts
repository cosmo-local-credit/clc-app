import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { NotificationPushSubscriptionJSON } from "../api/notification-client";
import type { NotificationConfigRecord } from "../storage/notification-db";
import {
  handlePushSubscriptionChange,
  type NotificationSubscriptionChangeDependencies,
} from "./subscription-change";

const oldSubscription = subscription("https://push.example/old");
const newSubscription = subscription("https://push.example/new");
const baseConfig: NotificationConfigRecord = {
  identityEpoch: "epoch-1",
  registrationId: "registration-1",
  appVersion: "web-test",
  key: "current",
  permissionState: "granted",
  platform: "chrome-android",
  serviceWorkerVersion: "worker-v1",
  subscriptionHash: "old-hash",
  updatedAt: "2026-06-11T12:00:00.000Z",
  vapidKeyVersion: "vapid-v1",
  vapidPublicKey: "public-key",
};

describe("handlePushSubscriptionChange", () => {
  let dependencies: NotificationSubscriptionChangeDependencies;
  let spies: ReturnType<typeof createSpies>;

  beforeEach(() => {
    spies = createSpies();
    dependencies = {
      fetchVapid: spies.fetchVapid,
      getCurrentSubscription: spies.getCurrentSubscription,
      getDeviceId: spies.getDeviceId,
      readConfig: spies.readConfig,
      recordFailure: spies.recordFailure,
      recordRefresh: spies.recordRefresh,
      registerDevice: spies.registerDevice,
      resubscribe: spies.resubscribe,
      updateConfig: spies.updateConfig,
    };
  });

  it("prefers the replacement subscription and refreshes the existing device", async () => {
    await expect(handlePushSubscriptionChange(newSubscription, dependencies)).resolves.toEqual({
      status: "refreshed",
      subscription: newSubscription,
    });

    expect(spies.getCurrentSubscription).not.toHaveBeenCalled();
    expect(spies.resubscribe).not.toHaveBeenCalled();
    expect(spies.registerDevice).toHaveBeenCalledWith(
      {
        registrationId: "registration-1",
        deviceId: "device-1",
        pushSubscription: newSubscription,
        vapidKeyVersion: "vapid-v1",
      },
      "epoch-1",
    );
    expect(spies.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionHash: expect.any(String),
        vapidKeyVersion: "vapid-v1",
        vapidPublicKey: "public-key",
      }),
      "epoch-1",
    );
  });

  it("falls back to the current PushManager subscription", async () => {
    spies.getCurrentSubscription.mockResolvedValue(oldSubscription);

    await expect(handlePushSubscriptionChange(null, dependencies)).resolves.toMatchObject({
      status: "refreshed",
      subscription: oldSubscription,
    });

    expect(spies.resubscribe).not.toHaveBeenCalled();
    expect(spies.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({ pushSubscription: oldSubscription }),
      "epoch-1",
    );
  });

  it("resubscribes with stored VAPID material when no subscription remains", async () => {
    spies.getCurrentSubscription.mockResolvedValue(null);
    spies.resubscribe.mockResolvedValue(newSubscription);

    await expect(handlePushSubscriptionChange(null, dependencies)).resolves.toMatchObject({
      status: "refreshed",
      subscription: newSubscription,
    });

    expect(spies.resubscribe).toHaveBeenCalledWith("public-key");
  });

  it("fetches VAPID material for an older config that did not persist it", async () => {
    spies.readConfig.mockResolvedValue({
      ...baseConfig,
      vapidKeyVersion: undefined,
      vapidPublicKey: undefined,
    });

    await handlePushSubscriptionChange(newSubscription, dependencies);

    expect(spies.fetchVapid).toHaveBeenCalledOnce();
    expect(spies.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({ vapidKeyVersion: "vapid-v2" }),
      "epoch-1",
    );
  });

  it("records backend failure without marking the new subscription as current", async () => {
    spies.registerDevice.mockRejectedValueOnce(new Error("backend unavailable"));

    await expect(handlePushSubscriptionChange(newSubscription, dependencies)).resolves.toEqual({
      status: "failed",
    });

    expect(spies.updateConfig).not.toHaveBeenCalled();
    expect(spies.recordRefresh).not.toHaveBeenCalled();
    expect(spies.recordFailure).toHaveBeenCalledWith("backend unavailable");
  });

  it("ignores change events when enrollment has no stable device", async () => {
    spies.getDeviceId.mockResolvedValue(null);

    await expect(handlePushSubscriptionChange(newSubscription, dependencies)).resolves.toEqual({
      status: "ignored",
    });
    expect(spies.registerDevice).not.toHaveBeenCalled();
  });
});

function createSpies() {
  return {
    fetchVapid: vi.fn().mockResolvedValue({
      keyVersion: "vapid-v2",
      publicKey: "fetched-public-key",
    }),
    getCurrentSubscription: vi.fn().mockResolvedValue(oldSubscription),
    getDeviceId: vi.fn().mockResolvedValue("device-1"),
    readConfig: vi.fn().mockResolvedValue(baseConfig),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    recordRefresh: vi.fn().mockResolvedValue(undefined),
    registerDevice: vi.fn().mockResolvedValue({}),
    resubscribe: vi.fn().mockResolvedValue(newSubscription),
    updateConfig: vi.fn().mockResolvedValue({}),
  };
}

function subscription(endpoint: string): NotificationPushSubscriptionJSON {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      auth: "auth",
      p256dh: "p256dh",
    },
  };
}
