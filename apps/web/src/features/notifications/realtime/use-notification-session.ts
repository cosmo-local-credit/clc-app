import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { createNotificationActivitySource } from "./activity-source";
import { primeNotificationCue } from "./alert-cue";
import { installAppBadgeSync } from "./app-badge";
import { dispatchMessagingChanged, NOTIFICATION_INBOX_CHANGED_EVENT } from "./events";
import { startNotificationSession } from "./session";

export function useNotificationSession(walletAddress: string | undefined): void {
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    if (!walletAddress) return;
    primeNotificationCue();
    const stopBadge = installAppBadgeSync();
    const controller = new AbortController();
    let stop: (() => void) | undefined;
    let retry: number | undefined;
    const connect = () => {
      if (controller.signal.aborted) return;
      void startNotificationSession({
        walletAddress,
        signal: controller.signal,
        activity: createNotificationActivitySource(router, queryClient, walletAddress),
        onInboxChanged: () => {
          window.dispatchEvent(new Event(NOTIFICATION_INBOX_CHANGED_EVENT));
        },
        onMessagingChanged: dispatchMessagingChanged,
        onIdentityChanged: () => {
          void queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
        },
      })
        .then((cleanup) => {
          stop = cleanup;
          if (controller.signal.aborted) cleanup();
        })
        .catch(() => {
          if (!controller.signal.aborted) retry = window.setTimeout(connect, 5_000);
        });
    };
    connect();
    return () => {
      stopBadge();
      controller.abort();
      window.clearTimeout(retry);
      stop?.();
    };
  }, [walletAddress, queryClient, router]);
}
