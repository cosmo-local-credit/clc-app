import { z } from "zod";

export type NotificationTransportOptions = {
  baseUrl: string;
  deviceToken?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

export class NotificationTransportError extends Error {
  constructor(public readonly status: number) {
    super(`Notification request failed with ${status}.`);
  }
}

const realtimeTokenSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string(),
  userId: z.string().min(1),
  walletAddress: z.string().min(1),
  websocketUrl: z.url().refine((value) => ["ws:", "wss:"].includes(new URL(value).protocol)),
});

export async function fetchNotificationRealtimeToken(options: NotificationTransportOptions) {
  return realtimeTokenSchema.parse(await request("/realtime/token", {}, options));
}

export async function refreshNotificationPushSubscription(
  body: {
    deviceId: string;
    registrationId: string;
    vapidKeyVersion?: string;
    pushSubscription: { endpoint: string; keys: { auth: string; p256dh: string } };
  },
  options: NotificationTransportOptions,
): Promise<void> {
  await request("/devices/refresh-subscription", body, options);
}

async function request(
  path: string,
  body: unknown,
  options: NotificationTransportOptions,
): Promise<unknown> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.deviceToken) headers.set("X-Notification-Device-Token", options.deviceToken);
  const response = await (options.fetcher ?? fetch)(
    `${options.baseUrl.replace(/\/+$/, "")}/api/notifications${path}`,
    {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    },
  );
  if (!response.ok) throw new NotificationTransportError(response.status);
  return response.json();
}
