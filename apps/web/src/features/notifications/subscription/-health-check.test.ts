import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { NotificationPushSubscriptionJSON } from "../api/notification-client";
import type { NotificationConfigRecord } from "../storage/notification-db";
import { runNotificationSubscriptionHealthCheck } from "./health-check";

const subscription: NotificationPushSubscriptionJSON = {
  endpoint: "https://push.example/subscription",
  expirationTime: null,
  keys: {
    auth: "auth",
    p256dh: "p256dh",
  },
};

const config: NotificationConfigRecord = {
  appVersion: "web-production",
  key: "current",
  permissionState: "granted",
  platform: "chrome-android",
  serviceWorkerVersion: "worker-v1",
  subscriptionHash: "outdated-hash",
  syncCursor: "cursor-1",
  updatedAt: "2026-06-11T12:00:00.000Z",
  vapidKeyVersion: "vapid-v1",
  vapidPublicKey: "public-key-v1",
};

const capability = {
  canRequestPermission: false,
  canSubscribe: true,
  hasNotification: true,
  hasPushManager: true,
  hasServiceWorker: true,
  isSecureContext: true,
  permission: "granted",
  platform: "chrome-android",
  reasons: [],
  status: "supported",
} as const;

describe("runNotificationSubscriptionHealthCheck", () => {
  let dependencies: ReturnType<typeof createDependencies>;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it("refreshes changed subscription state and links the active wallet without prompting", async () => {
    await expect(
      runNotificationSubscriptionHealthCheck(
        {
          appVersion: "web-production",
          currentWalletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          serviceWorkerVersion: "worker-v1",
        },
        dependencies,
      ),
    ).resolves.toMatchObject({
      status: "refreshed",
      subscription,
    });

    expect(dependencies.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "device-1",
        pushSubscription: subscription,
      }),
      undefined,
    );
    expect(dependencies.linkWallet).toHaveBeenCalledWith(
      {
        deviceId: "device-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      },
      undefined,
    );
    expect(dependencies.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionState: "granted",
        subscriptionHash: expect.any(String),
        syncCursor: "cursor-2",
      }),
    );
  });

  it("replaces the subscription when the VAPID key version changes", async () => {
    dependencies.fetchVapid.mockResolvedValue({
      keyVersion: "vapid-v2",
      publicKey: "public-key-v2",
    });
    dependencies.replaceSubscription.mockResolvedValue({
      ...subscription,
      endpoint: "https://push.example/replaced",
    });

    await expect(runNotificationSubscriptionHealthCheck({}, dependencies)).resolves.toMatchObject({
      status: "refreshed",
      subscription: { endpoint: "https://push.example/replaced" },
    });

    expect(dependencies.replaceSubscription).toHaveBeenCalledWith("public-key-v2");
  });

  it("does not request permission and skips refresh when permission is not granted", async () => {
    dependencies.detectCapability.mockReturnValue({
      ...capability,
      canRequestPermission: true,
      canSubscribe: false,
      permission: "default",
    });

    await expect(runNotificationSubscriptionHealthCheck({}, dependencies)).resolves.toEqual({
      status: "skipped",
    });

    expect(dependencies.fetchVapid).not.toHaveBeenCalled();
    expect(dependencies.registerDevice).not.toHaveBeenCalled();
    expect(dependencies.updateConfig).toHaveBeenCalledWith({
      permissionState: "default",
      platform: "chrome-android",
    });
  });

  it("records backend failure and leaves the stored subscription hash retryable", async () => {
    dependencies.registerDevice.mockRejectedValueOnce(new Error("backend unavailable"));

    await expect(runNotificationSubscriptionHealthCheck({}, dependencies)).resolves.toEqual({
      status: "failed",
    });

    expect(dependencies.updateConfig).not.toHaveBeenCalled();
    expect(dependencies.recordDiagnostic).toHaveBeenCalledWith({
      error: "backend unavailable",
      status: "failed",
    });
  });
});

function createDependencies() {
  return {
    detectCapability: vi.fn().mockReturnValue(capability),
    fetchVapid: vi.fn().mockResolvedValue({
      keyVersion: "vapid-v1",
      publicKey: "public-key-v1",
    }),
    getCurrentSubscription: vi.fn().mockResolvedValue(subscription),
    isStorageAvailable: vi.fn().mockReturnValue(true),
    linkWallet: vi.fn().mockResolvedValue({ linkedWalletAddresses: [] }),
    readConfig: vi.fn().mockResolvedValue(config),
    readDeviceId: vi.fn().mockResolvedValue("device-1"),
    recordDiagnostic: vi.fn().mockResolvedValue({}),
    registerDevice: vi.fn().mockResolvedValue({
      canonicalLinkedWalletAddresses: [],
      deviceId: "device-1",
      inboxSyncCursor: "cursor-2",
      notificationSettings: { enabled: true },
      status: "ok",
      subscriptionStatus: "active",
    }),
    replaceSubscription: vi.fn().mockResolvedValue(subscription),
    updateConfig: vi.fn().mockResolvedValue(config),
  };
}
