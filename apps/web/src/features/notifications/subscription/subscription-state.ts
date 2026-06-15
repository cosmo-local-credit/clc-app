import type { NotificationPushSubscriptionJSON } from "../api/notification-client";

export function serializePushSubscription(
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

export async function hashPushSubscription(
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

export async function subscribeWithVapidPublicKey(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<NotificationPushSubscriptionJSON> {
  const subscription = await registration.pushManager.subscribe({
    applicationServerKey: urlBase64ToUint8Array(publicKey),
    userVisibleOnly: true,
  });

  return serializePushSubscription(subscription);
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

function fallbackHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash.toString(16).padStart(8, "0");
}
