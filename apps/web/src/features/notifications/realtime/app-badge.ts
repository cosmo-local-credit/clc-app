import { readNotificationConfig, resetUnseenCount } from "../storage/notification-db";

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
};

/** Drops the icon badge. Missing APIs and rejected calls are ignored. */
export function clearNavigatorAppBadge(): void {
  try {
    const clear = (navigator as BadgeNavigator).clearAppBadge;
    if (typeof clear !== "function") return;
    void Promise.resolve(clear.call(navigator)).catch(() => undefined);
  } catch {
    // The badge API is missing outside the installed iOS app.
  }
}

async function clearStoredBadge(): Promise<void> {
  try {
    const config = await readNotificationConfig();
    if (config?.identityEpoch) await resetUnseenCount(config.identityEpoch);
  } catch {
    // Storage can be missing. The icon clear still runs.
  }
  clearNavigatorAppBadge();
}

function isBadgeMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "notification:badge"
  );
}

/**
 * Clears the badge while this window is visible: on mount, when the page
 * returns, and when a push raced that open.
 */
export function installAppBadgeSync(): () => void {
  const clearIfVisible = () => {
    if (document.visibilityState === "visible") void clearStoredBadge();
  };
  clearIfVisible();
  const onVisibility = () => clearIfVisible();
  document.addEventListener("visibilitychange", onVisibility);
  const onMessage = (event: MessageEvent<unknown>) => {
    if (document.visibilityState === "visible" && isBadgeMessage(event.data)) {
      void clearStoredBadge();
    }
  };
  const worker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  worker?.addEventListener("message", onMessage);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    worker?.removeEventListener("message", onMessage);
  };
}
