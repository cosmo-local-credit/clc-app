import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { primeNotificationCue } from "./alert-cue";
import { installAppBadgeSync } from "./app-badge";
import { startNotificationSession } from "./session";

export function useNotificationSession(walletAddress: string | undefined): void {
  const queryClient = useQueryClient();
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
        onInboxChanged: () => {
          window.dispatchEvent(new Event("clc-notification-inbox-changed"));
        },
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
  }, [walletAddress, queryClient]);
}
