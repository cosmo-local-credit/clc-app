import {
  fetchVapidPublicKey,
  type NotificationClientOptions,
  type NotificationPushSubscriptionJSON,
  registerNotificationDevice,
} from "../api/notification-client";
import { detectNotificationCapability, type NotificationCapability } from "../platform/capability";
import {
  isNotificationStorageAvailable,
  type NotificationConfigRecord,
  readNotificationConfig,
  readNotificationDeviceId,
  recordSubscriptionDiagnostic,
  updateNotificationConfig,
} from "../storage/notification-db";
import { NOTIFICATION_SERVICE_WORKER_VERSION } from "../sw/version";
import {
  hashPushSubscription,
  serializePushSubscription,
  subscribeWithVapidPublicKey,
} from "./subscription-state";

export type NotificationHealthCheckOptions = {
  appVersion?: string;
  client?: NotificationClientOptions;
  currentWalletAddress?: string;
  serviceWorkerVersion?: string;
};

export type NotificationHealthCheckResult =
  | {
      status: "failed";
    }
  | {
      status: "healthy" | "refreshed";
      subscription: NotificationPushSubscriptionJSON;
    }
  | {
      status: "skipped";
    };

type NotificationHealthCheckDependencies = {
  detectCapability: () => NotificationCapability;
  fetchVapid: typeof fetchVapidPublicKey;
  getCurrentSubscription: () => Promise<NotificationPushSubscriptionJSON | null>;
  isStorageAvailable: () => boolean;
  readConfig: () => Promise<NotificationConfigRecord | null>;
  readDeviceId: () => Promise<string | null>;
  recordDiagnostic: typeof recordSubscriptionDiagnostic;
  registerDevice: typeof registerNotificationDevice;
  replaceSubscription: (publicKey: string) => Promise<NotificationPushSubscriptionJSON>;
  updateConfig: typeof updateNotificationConfig;
};

export async function runNotificationSubscriptionHealthCheck(
  options: NotificationHealthCheckOptions = {},
  dependencies: NotificationHealthCheckDependencies = createDependencies(),
): Promise<NotificationHealthCheckResult> {
  const capability = dependencies.detectCapability();
  if (!options.currentWalletAddress) return { status: "skipped" };
  if (!dependencies.isStorageAvailable()) {
    return { status: "skipped" };
  }

  const [config, deviceId] = await Promise.all([
    dependencies.readConfig(),
    dependencies.readDeviceId(),
  ]);
  if (!config || !deviceId) {
    return { status: "skipped" };
  }

  const baseConfigPatch = {
    permissionState: capability.permission,
    platform: capability.platform,
  };
  if (capability.status !== "supported" || capability.permission !== "granted") {
    await dependencies.updateConfig(baseConfigPatch);
    return { status: "skipped" };
  }

  try {
    const serviceWorkerVersion =
      options.serviceWorkerVersion ?? NOTIFICATION_SERVICE_WORKER_VERSION;
    const vapid = await dependencies.fetchVapid(options.client);
    const currentSubscription = await dependencies.getCurrentSubscription();
    const shouldReplaceSubscription =
      !currentSubscription || config.vapidKeyVersion !== vapid.keyVersion;
    const subscription = shouldReplaceSubscription
      ? await dependencies.replaceSubscription(vapid.publicKey)
      : currentSubscription;
    const subscriptionHash = await hashPushSubscription(subscription, vapid.keyVersion);
    const registrationChanged =
      !config.registrationId ||
      config.identityWallet !== options.currentWalletAddress?.toLowerCase() ||
      shouldReplaceSubscription ||
      config.subscriptionHash !== subscriptionHash ||
      config.permissionState !== capability.permission ||
      config.platform !== capability.platform ||
      (options.appVersion !== undefined && config.appVersion !== options.appVersion) ||
      config.serviceWorkerVersion !== serviceWorkerVersion;

    const client = { ...options.client, identityEpoch: config.identityEpoch };
    let registration = {
      registrationId: config.registrationId,
      userId: config.userId,
      generation: config.generation,
    };
    let syncCursor = config.syncCursor;
    if (registrationChanged) {
      const response = await dependencies.registerDevice(
        {
          appVersion: options.appVersion ?? config.appVersion,
          currentWalletAddress: options.currentWalletAddress,
          deviceId,
          permissionState: capability.permission,
          platform: capability.platform,
          pushSubscription: subscription,
          serviceWorkerVersion,
          vapidKeyVersion: vapid.keyVersion,
        },
        client,
      );
      syncCursor ??= response.inboxSyncCursor;
      registration = {
        registrationId: response.registrationId,
        userId: response.userId,
        generation: response.generation,
      };
    }

    await Promise.all([
      dependencies.updateConfig(
        {
          ...baseConfigPatch,
          ...registration,
          appVersion: options.appVersion ?? config.appVersion,
          serviceWorkerVersion,
          subscriptionHash,
          syncCursor,
          vapidKeyVersion: vapid.keyVersion,
          vapidPublicKey: vapid.publicKey,
        },
        config.identityEpoch,
      ),
      dependencies.recordDiagnostic({
        endpoint: subscription.endpoint,
        status: registrationChanged ? "refreshed" : "active",
        vapidKeyVersion: vapid.keyVersion,
      }),
    ]);

    return {
      status: registrationChanged ? "refreshed" : "healthy",
      subscription,
    };
  } catch (error) {
    await dependencies
      .recordDiagnostic({
        error: errorMessage(error),
        status: "failed",
      })
      .catch(() => undefined);
    return { status: "failed" };
  }
}

function createDependencies(): NotificationHealthCheckDependencies {
  return {
    detectCapability: detectNotificationCapability,
    fetchVapid: fetchVapidPublicKey,
    getCurrentSubscription: readCurrentPushSubscription,
    isStorageAvailable: isNotificationStorageAvailable,
    readConfig: readNotificationConfig,
    readDeviceId: readNotificationDeviceId,
    recordDiagnostic: recordSubscriptionDiagnostic,
    registerDevice: registerNotificationDevice,
    replaceSubscription: replaceCurrentPushSubscription,
    updateConfig: updateNotificationConfig,
  };
}

async function readCurrentPushSubscription(): Promise<NotificationPushSubscriptionJSON | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? serializePushSubscription(subscription) : null;
}

async function replaceCurrentPushSubscription(
  publicKey: string,
): Promise<NotificationPushSubscriptionJSON> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error("Notification service worker is unavailable.");
  const currentSubscription = await registration.pushManager.getSubscription();
  await currentSubscription?.unsubscribe();
  return subscribeWithVapidPublicKey(registration, publicKey);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
