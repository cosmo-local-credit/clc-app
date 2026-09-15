import {
  type NotificationClientOptions,
  unlinkNotificationWallet,
} from "../api/notification-client";
import {
  clearNotificationIdentityStores,
  isNotificationStorageAvailable,
  readNotificationDeviceId,
} from "../storage/notification-db";

export type ResetNotificationIdentityOptions = {
  client?: NotificationClientOptions;
  /** The outgoing wallet, or undefined when the previous owner was a guest. */
  previousWalletAddress?: string;
};

/**
 * Moves this device's notification state off the outgoing account.
 *
 * Notifications are device-scoped by policy — `settingsScope: "device"` with
 * `signOutPolicy: "retain-until-explicit-disable"` in `logic/payload-schema.ts`
 * — and the backend models a device as having *many* linked wallets. Nothing
 * ever unlinked one, so on a shared phone the previous user stayed linked after
 * signing out and their voucher and swap alerts kept arriving for whoever picked
 * the phone up next.
 *
 * Two halves: the stored messages go (`clearNotificationIdentityStores`), and the
 * outgoing wallet is unlinked from the device so the backend stops targeting it.
 * The *incoming* wallet is not linked here — `subscription/health-check.ts`
 * already does that, driven by the recovery pass in `routes/__root.tsx`.
 *
 * Every failure is swallowed, matching `runNotificationRecovery`. This runs on
 * an identity boundary that has already happened; it can neither undo it nor be
 * allowed to block it.
 */
export async function resetNotificationIdentity(
  options: ResetNotificationIdentityOptions = {},
): Promise<void> {
  if (!isNotificationStorageAvailable()) return;

  // Read before clearing: the device record survives the clear, but ordering it
  // this way means an unlink still has its id even if the clear throws.
  const deviceId = await readNotificationDeviceId().catch(() => null);

  await clearNotificationIdentityStores().catch(() => undefined);

  if (!deviceId || !options.previousWalletAddress) return;

  await unlinkNotificationWallet(
    { deviceId, walletAddress: options.previousWalletAddress },
    options.client,
  ).catch(() => undefined);
}
