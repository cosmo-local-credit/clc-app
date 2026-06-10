import {
  fetchVapidPublicKey,
  linkNotificationWallet,
  type NotificationClientOptions,
  type NotificationPushSubscriptionJSON,
  type RegisterNotificationDeviceResponse,
  registerNotificationDevice,
  type VapidPublicKeyResponse,
} from "../api/notification-client";
import { detectNotificationCapability, type NotificationCapability } from "../platform/capability";
import {
  getOrCreateNotificationDeviceId,
  isNotificationStorageAvailable,
  type NotificationConfigRecord,
  readNotificationConfig,
  recordSubscriptionDiagnostic,
  updateNotificationConfig,
} from "../storage/notification-db";

const DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 20_000;

export type NotificationSubscriptionEnableStatus =
  | "enabled"
  | "failed"
  | "install-required"
  | "permission-denied"
  | "storage-unavailable"
  | "unsupported";

export type NotificationSubscriptionSnapshot = {
  capability: NotificationCapability;
  config: NotificationConfigRecord | null;
  subscription: NotificationPushSubscriptionJSON | null;
};

export type EnableNotificationSubscriptionOptions = {
  appVersion?: string;
  client?: NotificationClientOptions;
  currentWalletAddress?: string;
  serviceWorkerReadyTimeoutMs?: number;
  serviceWorkerVersion?: string;
};

export type EnableNotificationSubscriptionResult =
  | {
      capability: NotificationCapability;
      config: NotificationConfigRecord;
      deviceId: string;
      linkedWalletAddresses?: string[];
      registerResponse: RegisterNotificationDeviceResponse;
      status: "enabled";
      subscription: NotificationPushSubscriptionJSON;
      subscriptionHash: string;
      subscriptionWasReused: boolean;
      vapid: VapidPublicKeyResponse;
    }
  | {
      capability: NotificationCapability;
      config?: NotificationConfigRecord | null;
      deviceId?: string;
      error?: unknown;
      message?: string;
      status: Exclude<NotificationSubscriptionEnableStatus, "enabled">;
    };

export async function readNotificationSubscriptionSnapshot(): Promise<NotificationSubscriptionSnapshot> {
  const capability = detectNotificationCapability();
  const config = isNotificationStorageAvailable() ? await readNotificationConfig() : null;
  const subscription = await readCurrentPushSubscription();

  return {
    capability,
    config,
    subscription,
  };
}

export async function enableNotificationSubscription(
  options: EnableNotificationSubscriptionOptions = {},
): Promise<EnableNotificationSubscriptionResult> {
  const initialCapability = detectNotificationCapability();

  if (initialCapability.status === "install-required") {
    return { capability: initialCapability, status: "install-required" };
  }

  if (initialCapability.status === "unsupported") {
    return { capability: initialCapability, status: "unsupported" };
  }

  if (!isNotificationStorageAvailable()) {
    return { capability: initialCapability, status: "storage-unavailable" };
  }

  const deviceId = await getOrCreateNotificationDeviceId();
  const permission = await requestNotificationPermissionIfNeeded(initialCapability);
  const capability = detectNotificationCapability();
  const configPatch = {
    permissionState: capability.permission,
  };

  if (permission !== "granted") {
    const config = await updateNotificationConfig(configPatch);
    return {
      capability,
      config,
      deviceId,
      status: "permission-denied",
    };
  }

  try {
    const registration = await waitForServiceWorkerReady(
      options.serviceWorkerReadyTimeoutMs ?? DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS,
    );
    const vapid = await fetchVapidPublicKey(options.client);
    const config = await readNotificationConfig();
    const subscriptionResult = await getOrCreatePushSubscription({
      registration,
      vapid,
      vapidKeyVersion: config?.vapidKeyVersion,
    });
    const subscriptionHash = await hashPushSubscription(
      subscriptionResult.subscription,
      vapid.keyVersion,
    );
    const serviceWorkerVersion =
      options.serviceWorkerVersion ?? readServiceWorkerVersion(registration);
    const appVersion = options.appVersion ?? readAppVersion();

    const registerResponse = await registerNotificationDevice(
      {
        appVersion,
        currentWalletAddress: options.currentWalletAddress,
        deviceId,
        permissionState: capability.permission,
        platform: capability.platform,
        pushSubscription: subscriptionResult.subscription,
        serviceWorkerVersion,
        vapidKeyVersion: vapid.keyVersion,
      },
      options.client,
    );
    const linkResponse = options.currentWalletAddress
      ? await linkNotificationWallet(
          {
            deviceId,
            walletAddress: options.currentWalletAddress,
          },
          options.client,
        )
      : null;

    const nextConfig = await updateNotificationConfig({
      appVersion,
      permissionState: capability.permission,
      serviceWorkerVersion,
      subscriptionHash,
      syncCursor: registerResponse.inboxSyncCursor,
      vapidKeyVersion: vapid.keyVersion,
    });

    await recordSubscriptionDiagnostic({
      endpoint: subscriptionResult.subscription.endpoint,
      status: subscriptionResult.subscriptionWasReused ? "active" : "refreshed",
      vapidKeyVersion: vapid.keyVersion,
    });

    return {
      capability,
      config: nextConfig,
      deviceId,
      linkedWalletAddresses: linkResponse?.linkedWalletAddresses,
      registerResponse,
      status: "enabled",
      subscription: subscriptionResult.subscription,
      subscriptionHash,
      subscriptionWasReused: subscriptionResult.subscriptionWasReused,
      vapid,
    };
  } catch (error) {
    await recordSubscriptionDiagnostic({
      error: errorMessage(error),
      status: "failed",
    });

    return {
      capability,
      deviceId,
      error,
      message: errorMessage(error),
      status: "failed",
    };
  }
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

async function requestNotificationPermissionIfNeeded(
  capability: NotificationCapability,
): Promise<NotificationPermission> {
  if (capability.permission === "granted") {
    return "granted";
  }

  if (capability.permission === "denied") {
    return "denied";
  }

  return Notification.requestPermission();
}

async function waitForServiceWorkerReady(timeoutMs: number): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not available.");
  }

  return promiseWithTimeout(
    navigator.serviceWorker.ready,
    timeoutMs,
    "Timed out waiting for the service worker to become ready.",
  );
}

async function getOrCreatePushSubscription({
  registration,
  vapid,
  vapidKeyVersion,
}: {
  registration: ServiceWorkerRegistration;
  vapid: VapidPublicKeyResponse;
  vapidKeyVersion?: string;
}): Promise<{
  subscription: NotificationPushSubscriptionJSON;
  subscriptionWasReused: boolean;
}> {
  const currentSubscription = await registration.pushManager.getSubscription();
  if (currentSubscription && vapidKeyVersion === vapid.keyVersion) {
    return {
      subscription: serializePushSubscription(currentSubscription),
      subscriptionWasReused: true,
    };
  }

  if (currentSubscription) {
    await currentSubscription.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
    userVisibleOnly: true,
  });

  return {
    subscription: serializePushSubscription(subscription),
    subscriptionWasReused: false,
  };
}

async function readCurrentPushSubscription(): Promise<NotificationPushSubscriptionJSON | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  return subscription ? serializePushSubscription(subscription) : null;
}

function serializePushSubscription(
  subscription: PushSubscription,
): NotificationPushSubscriptionJSON {
  const json = subscription.toJSON();
  const auth = json.keys?.auth;
  const p256dh = json.keys?.p256dh;

  if (!json.endpoint || !auth || !p256dh) {
    throw new Error("PushSubscription is missing endpoint, auth, or p256dh.");
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      auth,
      p256dh,
    },
  };
}

async function hashPushSubscription(
  subscription: NotificationPushSubscriptionJSON,
  vapidKeyVersion: string,
): Promise<string> {
  const input = JSON.stringify({
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: subscription.keys,
    vapidKeyVersion,
  });

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input),
    );
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return fallbackHash(input);
}

function fallbackHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash.toString(16).padStart(8, "0");
}

function readServiceWorkerVersion(registration: ServiceWorkerRegistration): string | undefined {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker?.scriptURL) {
    return undefined;
  }

  return new URL(worker.scriptURL).pathname;
}

function readAppVersion(): string {
  return `web-${import.meta.env.MODE ?? "unknown"}`;
}

async function promiseWithTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    void Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
