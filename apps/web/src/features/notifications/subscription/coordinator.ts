import { fetchNotificationRealtimeToken } from "@clc/api/features/notifications/client";
import {
  getNotificationBackendBaseUrl,
  fetchVapidPublicKey,
  type NotificationClientOptions,
  type NotificationPushSubscriptionJSON,
  type RegisterNotificationDeviceResponse,
  registerNotificationDevice,
  type VapidPublicKeyResponse,
} from "../api/notification-client";
import { detectNotificationCapability, type NotificationCapability } from "../platform/capability";
import {
  beginNotificationIdentity,
  getOrCreateNotificationDeviceId,
  isNotificationStorageAvailable,
  type NotificationConfigRecord,
  readNotificationConfig,
  recordSubscriptionDiagnostic,
  updateNotificationConfig,
} from "../storage/notification-db";
import { NOTIFICATION_SERVICE_WORKER_VERSION } from "../sw/version";
import {
  hashPushSubscription,
  serializePushSubscription,
  subscribeWithVapidPublicKey,
} from "./subscription-state";

const DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS = 20_000;

type NotificationSubscriptionEnableStatus =
  | "enabled"
  | "failed"
  | "install-required"
  | "permission-denied"
  | "storage-unavailable"
  | "unsupported";

export type NotificationSubscriptionSnapshot = {
  capability: NotificationCapability;
  config: NotificationConfigRecord | null;
  storageAvailable: boolean;
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
  const storageAvailable = isNotificationStorageAvailable();
  const config = storageAvailable ? await readNotificationConfig() : null;
  const subscription = await readCurrentPushSubscription();

  return {
    capability,
    config,
    storageAvailable,
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
    const token = await fetchNotificationRealtimeToken({
      baseUrl: options.client?.baseUrl ?? getNotificationBackendBaseUrl(),
      fetcher: options.client?.fetcher,
      signal: options.client?.signal,
    });
    if (
      options.currentWalletAddress &&
      token.walletAddress.toLowerCase() !== options.currentWalletAddress.toLowerCase()
    )
      throw new Error("Notification session changed.");
    const identity = await beginNotificationIdentity(token.walletAddress, token.userId);
    const client = { ...options.client, identityEpoch: identity.identityEpoch };
    const registration = await waitForServiceWorkerReady(
      options.serviceWorkerReadyTimeoutMs ?? DEFAULT_SERVICE_WORKER_READY_TIMEOUT_MS,
    );
    const vapid = await fetchVapidPublicKey(client);
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
      options.serviceWorkerVersion ?? NOTIFICATION_SERVICE_WORKER_VERSION;
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
      client,
    );
    const nextConfig = await updateNotificationConfig(
      {
        appVersion,
        permissionState: capability.permission,
        platform: capability.platform,
        serviceWorkerVersion,
        subscriptionHash,
        registrationId: registerResponse.registrationId,
        userId: registerResponse.userId,
        generation: registerResponse.generation,
        syncCursor: config?.syncCursor ?? registerResponse.inboxSyncCursor,
        vapidKeyVersion: vapid.keyVersion,
        vapidPublicKey: vapid.publicKey,
      },
      identity.identityEpoch,
    );

    await recordSubscriptionDiagnostic({
      endpoint: subscriptionResult.subscription.endpoint,
      status: subscriptionResult.subscriptionWasReused ? "active" : "refreshed",
      vapidKeyVersion: vapid.keyVersion,
    });

    return {
      capability,
      config: nextConfig,
      deviceId,
      linkedWalletAddresses: registerResponse.canonicalLinkedWalletAddresses,
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

  return {
    subscription: await subscribeWithVapidPublicKey(registration, vapid.publicKey),
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
