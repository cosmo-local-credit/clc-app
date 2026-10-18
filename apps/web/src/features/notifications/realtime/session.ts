import {
  fetchNotificationRealtimeToken,
  NotificationTransportError,
} from "@clc/api/features/notifications/client";
import {
  getNotificationBackendBaseUrl,
  registerNotificationDevice,
} from "../api/notification-client";
import { whenNotificationIdentitySettled } from "../recovery/identity-reset";
import { runNotificationRecovery } from "../recovery/recovery";
import {
  NOTIFICATION_IDENTITY_EVENT,
  beginNotificationIdentity,
  getOrCreateNotificationDeviceId,
  isNotificationIdentityCurrent,
  readNotificationConfig,
  updateNotificationConfig,
} from "../storage/notification-db";
import { connectNotificationRealtime } from "./connection";

export async function startNotificationSession(options: {
  walletAddress: string;
  signal: AbortSignal;
  onInboxChanged: () => void;
  onIdentityChanged: () => void;
}): Promise<() => void> {
  await whenNotificationIdentitySettled();
  if (options.signal.aborted) return () => {};
  const baseUrl = getNotificationBackendBaseUrl();
  const token = await fetchNotificationRealtimeToken({ baseUrl, signal: options.signal }).catch(
    (error: unknown) => {
      if (error instanceof NotificationTransportError && [401, 403].includes(error.status))
        options.onIdentityChanged();
      throw error;
    },
  );
  if (options.signal.aborted) return () => {};
  if (token.walletAddress.toLowerCase() !== options.walletAddress.toLowerCase()) {
    options.onIdentityChanged();
    return () => {};
  }
  const identity = await beginNotificationIdentity(options.walletAddress, token.userId);
  const identityEpoch = identity.identityEpoch;
  if (options.signal.aborted || !(await isNotificationIdentityCurrent(identityEpoch)))
    return () => {};
  const client = { identityEpoch, signal: options.signal };
  const deviceId = await getOrCreateNotificationDeviceId();
  if (!identity.registrationId || identity.userId !== token.userId) {
    const registered = await registerNotificationDevice(
      { deviceId, currentWalletAddress: options.walletAddress },
      client,
    );
    if (registered.userId !== token.userId || options.signal.aborted) return () => {};
    await updateNotificationConfig(
      {
        registrationId: registered.registrationId,
        userId: registered.userId,
        generation: registered.generation,
        syncCursor: identity.syncCursor ?? registered.inboxSyncCursor,
      },
      identityEpoch,
    );
  }
  void runNotificationRecovery({ client, currentWalletAddress: options.walletAddress })
    .then(() => {
      if (!options.signal.aborted) options.onInboxChanged();
    })
    .catch(() => undefined);
  if (options.signal.aborted || !(await isNotificationIdentityCurrent(identityEpoch)))
    return () => {};
  options.onInboxChanged();
  const stopConnection = await connectNotificationRealtime({
    initialToken: token,
    identityEpoch,
    userId: token.userId,
    walletAddress: options.walletAddress,
    baseUrl,
    client,
    signal: options.signal,
    onInboxChanged: options.onInboxChanged,
    onIdentityChanged: options.onIdentityChanged,
  });
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(NOTIFICATION_IDENTITY_EVENT)
      : null;
  const checkIdentity = () => {
    void readNotificationConfig().then((current) => {
      if (current?.identityEpoch !== identityEpoch) {
        stopConnection();
        options.onIdentityChanged();
      }
    });
  };
  channel?.addEventListener("message", checkIdentity);
  const stop = () => {
    stopConnection();
    channel?.close();
    window.removeEventListener("storage", checkIdentity);
    options.signal.removeEventListener("abort", stop);
  };
  window.addEventListener("storage", checkIdentity);
  options.signal.addEventListener("abort", stop, { once: true });
  if (options.signal.aborted) stop();
  return stop;
}
