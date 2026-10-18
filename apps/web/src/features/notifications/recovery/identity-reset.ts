import { BackendApiError } from "@clc/api/client/errors";
import { authClient } from "#/lib/api/auth";
import {
  type NotificationClientOptions,
  unlinkNotificationWallet,
} from "../api/notification-client";
import {
  clearNotificationIdentityStores,
  isNotificationStorageAvailable,
  readNotificationConfig,
  readNotificationDeviceId,
} from "../storage/notification-db";

export type ResetNotificationIdentityOptions = {
  client?: NotificationClientOptions;
  previousWalletAddress?: string;
  onlyIfSessionEnded?: boolean;
};

let pendingReset: Promise<void> = Promise.resolve();

export function resetNotificationIdentity(
  options: ResetNotificationIdentityOptions = {},
): Promise<void> {
  pendingReset = pendingReset.catch(() => undefined).then(() => runReset(options));
  return pendingReset;
}

export function whenNotificationIdentitySettled(): Promise<void> {
  return pendingReset;
}

export function resetNotificationIdentityBarrierForTests(): void {
  pendingReset = Promise.resolve();
}

async function runReset(options: ResetNotificationIdentityOptions): Promise<void> {
  if (!isNotificationStorageAvailable()) return;
  if (options.onlyIfSessionEnded) {
    try {
      if (await authClient.getSession()) return;
    } catch (error) {
      if (!(error instanceof BackendApiError) || error.kind !== "unauthenticated") return;
    }
  }
  const [deviceId, config] = await Promise.all([
    readNotificationDeviceId().catch(() => null),
    readNotificationConfig().catch(() => null),
  ]);
  if (
    options.previousWalletAddress &&
    config?.identityWallet &&
    config.identityWallet !== options.previousWalletAddress.toLowerCase()
  )
    return;
  await clearNotificationIdentityStores(options.previousWalletAddress).catch(() => undefined);
  if (config?.registrationId && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registrationId = config.registrationId;
    void navigator.serviceWorker
      .getRegistration()
      .then(async (registration) => {
        const notifications = await registration?.getNotifications();
        for (const notification of notifications ?? []) {
          const data = notification.data as { registrationId?: string } | undefined;
          if (data?.registrationId === registrationId) notification.close();
        }
      })
      .catch(() => undefined);
  }
  const previousWalletAddress = options.previousWalletAddress ?? config?.identityWallet;
  if (!deviceId || !config?.registrationId || !previousWalletAddress) return;
  // The explicit captured registration makes a delayed logout safe after a newer login.
  await unlinkNotificationWallet(
    {
      deviceId,
      registrationId: config.registrationId,
      walletAddress: previousWalletAddress,
    },
    options.client,
  ).catch(() => undefined);
}
