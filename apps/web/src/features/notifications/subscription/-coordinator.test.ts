import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({
  getNotificationBackendBaseUrl: () => "https://api.example",
  fetchVapidPublicKey: vi.fn(),
  linkNotificationWallet: vi.fn(),
  registerNotificationDevice: vi.fn(),
}));

const capability = vi.hoisted(() => ({
  detectNotificationCapability: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  beginNotificationIdentity: vi.fn().mockResolvedValue({ identityEpoch: "epoch-1" }),
  getOrCreateNotificationDeviceId: vi.fn(),
  isNotificationStorageAvailable: vi.fn(),
  readNotificationConfig: vi.fn(),
  recordSubscriptionDiagnostic: vi.fn(),
  updateNotificationConfig: vi.fn(),
}));

const subscriptionState = vi.hoisted(() => ({
  hashPushSubscription: vi.fn(),
  serializePushSubscription: vi.fn(),
  subscribeWithVapidPublicKey: vi.fn(),
}));

vi.mock("../api/notification-client", () => api);
vi.mock("@clc/api/features/notifications/client", () => ({
  fetchNotificationRealtimeToken: vi
    .fn()
    .mockResolvedValue({ walletAddress: "0x1234", userId: "user-1" }),
}));
vi.mock("../platform/capability", () => capability);
vi.mock("../storage/notification-db", () => storage);
vi.mock("./subscription-state", () => subscriptionState);

const { enableNotificationSubscription } = await import("./coordinator");

const supportedCapability = {
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

const serializedSubscription = {
  endpoint: "https://push.example/subscription",
  expirationTime: null,
  keys: {
    auth: "auth",
    p256dh: "p256dh",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  capability.detectNotificationCapability.mockReturnValue(supportedCapability);
  storage.getOrCreateNotificationDeviceId.mockResolvedValue("device-1");
  storage.isNotificationStorageAvailable.mockReturnValue(true);
  storage.readNotificationConfig.mockResolvedValue({ key: "current", vapidKeyVersion: "v1" });
  storage.updateNotificationConfig.mockResolvedValue({
    key: "current",
    permissionState: "granted",
    subscriptionHash: "subscription-hash",
    updatedAt: "2026-06-11T12:00:00.000Z",
  });
  storage.recordSubscriptionDiagnostic.mockResolvedValue(undefined);
  api.fetchVapidPublicKey.mockResolvedValue({
    keyVersion: "v1",
    publicKey: "public-key",
  });
  api.registerNotificationDevice.mockResolvedValue({
    registrationId: "registration-1",
    userId: "user-1",
    generation: 1,
    canonicalLinkedWalletAddresses: ["0x1234"],
    deviceId: "device-1",
    inboxSyncCursor: "cursor-1",
    notificationSettings: { enabled: true },
    status: "registered",
    subscriptionStatus: "active",
  });
  api.linkNotificationWallet.mockResolvedValue({
    linkedWalletAddresses: ["0x1234"],
  });
  subscriptionState.hashPushSubscription.mockResolvedValue("subscription-hash");
  subscriptionState.serializePushSubscription.mockReturnValue(serializedSubscription);
  subscriptionState.subscribeWithVapidPublicKey.mockResolvedValue(serializedSubscription);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enableNotificationSubscription", () => {
  it("returns install-required without requesting permission or creating a device", async () => {
    capability.detectNotificationCapability.mockReturnValue({
      ...supportedCapability,
      canSubscribe: false,
      platform: "ios-safari-tab",
      reasons: ["ios-safari-tab"],
      status: "install-required",
    });
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { requestPermission });

    await expect(enableNotificationSubscription()).resolves.toMatchObject({
      status: "install-required",
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(storage.getOrCreateNotificationDeviceId).not.toHaveBeenCalled();
  });

  it("records denied permission without contacting the backend", async () => {
    capability.detectNotificationCapability
      .mockReturnValueOnce({
        ...supportedCapability,
        canRequestPermission: true,
        canSubscribe: false,
        permission: "default",
      })
      .mockReturnValueOnce({
        ...supportedCapability,
        canSubscribe: false,
        permission: "denied",
      });
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", { requestPermission });

    await expect(enableNotificationSubscription()).resolves.toMatchObject({
      deviceId: "device-1",
      status: "permission-denied",
    });

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(storage.updateNotificationConfig).toHaveBeenCalledWith({
      permissionState: "denied",
    });
    expect(api.fetchVapidPublicKey).not.toHaveBeenCalled();
    expect(api.registerNotificationDevice).not.toHaveBeenCalled();
  });

  it("reuses the current subscription, registers the device, and links the wallet", async () => {
    const { subscription: currentSubscription } = pushSubscription();
    const { registration, subscribe } = serviceWorkerRegistration(currentSubscription);
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve(registration) } });

    await expect(
      enableNotificationSubscription({
        appVersion: "web-test",
        currentWalletAddress: "0x1234",
        serviceWorkerVersion: "worker-v1",
      }),
    ).resolves.toMatchObject({
      deviceId: "device-1",
      linkedWalletAddresses: ["0x1234"],
      status: "enabled",
      subscriptionWasReused: true,
    });

    expect(subscribe).not.toHaveBeenCalled();
    expect(api.registerNotificationDevice).toHaveBeenCalledWith(
      {
        appVersion: "web-test",
        currentWalletAddress: "0x1234",
        deviceId: "device-1",
        permissionState: "granted",
        platform: "chrome-android",
        pushSubscription: serializedSubscription,
        serviceWorkerVersion: "worker-v1",
        vapidKeyVersion: "v1",
      },
      { identityEpoch: "epoch-1" },
    );
    expect(api.linkNotificationWallet).not.toHaveBeenCalled();
  });

  it("replaces the subscription when the VAPID key version changes", async () => {
    const { subscription: currentSubscription, unsubscribe } = pushSubscription();
    storage.readNotificationConfig.mockResolvedValue({
      key: "current",
      vapidKeyVersion: "v1",
    });
    api.fetchVapidPublicKey.mockResolvedValue({
      keyVersion: "v2",
      publicKey: "new-public-key",
    });
    const { registration } = serviceWorkerRegistration(currentSubscription);
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve(registration) } });

    await expect(enableNotificationSubscription()).resolves.toMatchObject({
      status: "enabled",
      subscriptionWasReused: false,
    });

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(subscriptionState.subscribeWithVapidPublicKey).toHaveBeenCalledWith(
      registration,
      "new-public-key",
    );
  });

  it("records a retryable diagnostic when backend registration fails", async () => {
    const error = new Error("Backend unavailable");
    api.registerNotificationDevice.mockRejectedValue(error);
    const { subscription } = pushSubscription();
    const { registration } = serviceWorkerRegistration(subscription);
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve(registration) } });

    await expect(enableNotificationSubscription()).resolves.toMatchObject({
      deviceId: "device-1",
      error,
      message: "Backend unavailable",
      status: "failed",
    });

    expect(storage.recordSubscriptionDiagnostic).toHaveBeenLastCalledWith({
      error: "Backend unavailable",
      status: "failed",
    });
  });
});

function pushSubscription() {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = {
    toJSON: vi.fn(),
    unsubscribe,
  } as unknown as PushSubscription;

  return { subscription, unsubscribe };
}

function serviceWorkerRegistration(currentSubscription: PushSubscription) {
  const subscribe = vi.fn();
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(currentSubscription),
      subscribe,
    },
  } as unknown as ServiceWorkerRegistration;

  return { registration, subscribe };
}
