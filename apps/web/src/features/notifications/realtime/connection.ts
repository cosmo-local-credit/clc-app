import {
  fetchNotificationRealtimeToken,
  NotificationTransportError,
} from "@clc/api/features/notifications/client";
import { Centrifuge, UnauthorizedError } from "centrifuge";
import { z } from "zod";
import { showForegroundNotification } from "./foreground-toast";
import type { NotificationClientOptions } from "../api/notification-client";
import { syncNotificationInboxState } from "../recovery/recovery";
import { isNotificationIdentityCurrent } from "../storage/notification-db";

const publicationSchema = z.object({
  notificationId: z.string().min(1),
  revision: z.number().int().nonnegative(),
});

export async function connectNotificationRealtime(options: {
  identityEpoch: string;
  userId: string;
  walletAddress: string;
  baseUrl: string;
  client?: NotificationClientOptions;
  signal?: AbortSignal;
  onInboxChanged?: () => void;
  onIdentityChanged?: () => void;
  initialToken?: Awaited<ReturnType<typeof fetchNotificationRealtimeToken>>;
}): Promise<() => void> {
  const { identityEpoch, userId } = options;
  const transport = {
    baseUrl: options.baseUrl,
    fetcher: options.client?.fetcher,
    signal: options.signal,
  };
  const initial = options.initialToken ?? (await fetchNotificationRealtimeToken(transport));
  if (
    options.signal?.aborted ||
    initial.userId !== userId ||
    initial.walletAddress.toLowerCase() !== options.walletAddress.toLowerCase() ||
    !(await isNotificationIdentityCurrent(identityEpoch))
  )
    return () => {};
  let stopped = false;
  let syncing = false;
  let syncRequested = false;
  const revisions = new Map<string, number>();
  const dismissToasts = new Map<string, () => void>();
  const client = new Centrifuge(initial.websocketUrl, {
    token: initial.token,
    getToken: async () => {
      if (
        stopped ||
        options.signal?.aborted ||
        !(await isNotificationIdentityCurrent(identityEpoch))
      )
        throw new UnauthorizedError("Notification session changed.");
      try {
        const refreshed = await fetchNotificationRealtimeToken(transport);
        if (
          stopped ||
          options.signal?.aborted ||
          refreshed.userId !== userId ||
          refreshed.walletAddress.toLowerCase() !== options.walletAddress.toLowerCase() ||
          !(await isNotificationIdentityCurrent(identityEpoch))
        )
          throw new UnauthorizedError("Notification session changed.");
        return refreshed.token;
      } catch (error) {
        if (
          error instanceof UnauthorizedError ||
          (error instanceof NotificationTransportError && [401, 403].includes(error.status))
        ) {
          options.onIdentityChanged?.();
          throw new UnauthorizedError("Notification session changed.");
        }
        throw error;
      }
    },
  });

  async function sync(): Promise<void> {
    syncRequested = true;
    if (syncing || stopped) return;
    syncing = true;
    try {
      while (syncRequested && !stopped && !options.signal?.aborted) {
        syncRequested = false;
        if (!(await isNotificationIdentityCurrent(identityEpoch))) {
          stop();
          return;
        }
        const result = await syncNotificationInboxState({
          client: { ...options.client, signal: options.signal, identityEpoch },
          currentWalletAddress: options.walletAddress,
        });
        if (!stopped && !options.signal?.aborted && result.status === "synced")
          options.onInboxChanged?.();
      }
    } catch {
      // The durable feed is retried on reconnect, online, visibility, or publication.
    } finally {
      syncing = false;
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    for (const dismiss of dismissToasts.values()) dismiss();
    dismissToasts.clear();
    client.disconnect();
    client.removeAllListeners();
    options.signal?.removeEventListener("abort", stop);
    if (typeof window !== "undefined") window.removeEventListener("online", recover);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visible);
  }
  function recover(): void {
    void sync();
  }
  function visible(): void {
    if (document.visibilityState === "visible") recover();
  }

  client.on("connected", recover);
  client.on("publication", (event) => {
    const parsed = publicationSchema.safeParse(event.data);
    if (!parsed.success || stopped) return;
    const { notificationId, revision } = parsed.data;
    if ((revisions.get(notificationId) ?? -1) >= revision) return;
    revisions.set(notificationId, revision);
    if (revisions.size > 512) {
      const oldest = revisions.keys().next().value;
      if (oldest !== undefined) revisions.delete(oldest);
    }
    void showForegroundNotification(event.data, identityEpoch, userId, options.client)
      .then((dismiss) => {
        if (stopped) dismiss();
        else {
          dismissToasts.get(notificationId)?.();
          dismissToasts.set(notificationId, dismiss);
          if (dismissToasts.size > 20) {
            const oldest = dismissToasts.keys().next().value;
            if (oldest !== undefined) {
              dismissToasts.get(oldest)?.();
              dismissToasts.delete(oldest);
            }
          }
        }
      })
      .catch(() => undefined);
    // Publications wake the durable feed; only its revisioned pages mutate the inbox.
    recover();
  });
  client.on("error", () => {});
  options.signal?.addEventListener("abort", stop, { once: true });
  if (typeof window !== "undefined") window.addEventListener("online", recover);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visible);
  client.connect();
  return stop;
}
