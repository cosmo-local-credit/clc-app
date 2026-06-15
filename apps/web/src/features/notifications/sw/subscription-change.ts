import type {
  NotificationPushSubscriptionJSON,
  RegisterNotificationDeviceRequest,
  VapidPublicKeyResponse,
} from "../api/notification-client";
import type { NotificationConfigRecord } from "../storage/notification-db";
import { hashPushSubscription } from "../subscription/subscription-state";

export type NotificationSubscriptionChangeDependencies = {
  fetchVapid: () => Promise<VapidPublicKeyResponse>;
  getCurrentSubscription: () => Promise<NotificationPushSubscriptionJSON | null>;
  getDeviceId: () => Promise<string | null>;
  readConfig: () => Promise<NotificationConfigRecord | null>;
  recordFailure: (error: string) => Promise<unknown>;
  recordRefresh: (
    subscription: NotificationPushSubscriptionJSON,
    vapidKeyVersion: string,
  ) => Promise<unknown>;
  registerDevice: (request: RegisterNotificationDeviceRequest) => Promise<unknown>;
  resubscribe: (publicKey: string) => Promise<NotificationPushSubscriptionJSON>;
  updateConfig: (
    patch: Partial<
      Pick<NotificationConfigRecord, "subscriptionHash" | "vapidKeyVersion" | "vapidPublicKey">
    >,
  ) => Promise<unknown>;
};

export type NotificationSubscriptionChangeResult =
  | {
      status: "ignored";
    }
  | {
      status: "failed";
    }
  | {
      status: "refreshed";
      subscription: NotificationPushSubscriptionJSON;
    };

export async function handlePushSubscriptionChange(
  newSubscription: NotificationPushSubscriptionJSON | null,
  dependencies: NotificationSubscriptionChangeDependencies,
): Promise<NotificationSubscriptionChangeResult> {
  try {
    const [deviceId, config] = await Promise.all([
      dependencies.getDeviceId(),
      dependencies.readConfig(),
    ]);
    if (!deviceId) {
      return { status: "ignored" };
    }

    const vapid = await resolveVapid(config, dependencies);
    const subscription =
      newSubscription ??
      (await dependencies.getCurrentSubscription()) ??
      (await dependencies.resubscribe(vapid.publicKey));
    const subscriptionHash = await hashPushSubscription(subscription, vapid.keyVersion);

    await dependencies.registerDevice({
      deviceId,
      pushSubscription: subscription,
      vapidKeyVersion: vapid.keyVersion,
    });
    await Promise.all([
      dependencies.updateConfig({
        subscriptionHash,
        vapidKeyVersion: vapid.keyVersion,
        vapidPublicKey: vapid.publicKey,
      }),
      dependencies.recordRefresh(subscription, vapid.keyVersion),
    ]);

    return {
      status: "refreshed",
      subscription,
    };
  } catch (error) {
    await dependencies.recordFailure(errorMessage(error)).catch(() => undefined);
    return { status: "failed" };
  }
}

async function resolveVapid(
  config: NotificationConfigRecord | null,
  dependencies: NotificationSubscriptionChangeDependencies,
): Promise<VapidPublicKeyResponse> {
  if (config?.vapidKeyVersion && config.vapidPublicKey) {
    return {
      keyVersion: config.vapidKeyVersion,
      publicKey: config.vapidPublicKey,
    };
  }

  return dependencies.fetchVapid();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
