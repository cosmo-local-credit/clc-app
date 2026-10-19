import { readNotificationConfig, resetUnseenCount } from "../storage/notification-db";

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (count: number) => Promise<void>;
};

/** Drops the icon badge. Missing APIs and rejected calls are ignored. */
export async function clearNavigatorAppBadge(): Promise<void> {
  try {
    const clear = (navigator as BadgeNavigator).clearAppBadge;
    if (typeof clear !== "function") return;
    await clear.call(navigator);
  } catch {
    // The badge API is missing outside the installed iOS app.
  }
}

/** Reconciles a native badge write with concurrent pushes and identity resets. */
export async function syncNavigatorAppBadge(): Promise<void> {
  try {
    const nav = navigator as BadgeNavigator;
    if (typeof nav.setAppBadge !== "function" && typeof nav.clearAppBadge !== "function") return;
    let config = await readNotificationConfig();
    for (;;) {
      const count = config?.unseenCount ?? 0;
      if (count > 0) await nav.setAppBadge?.(count);
      else await nav.clearAppBadge?.();
      // Another context can reset or increment while the browser updates the icon.
      const latest = await readNotificationConfig();
      if ((latest?.unseenCount ?? 0) === count) return;
      config = latest;
    }
  } catch {
    // Badge failures must not block notification delivery or sign-out.
  }
}

async function clearStoredBadge(): Promise<void> {
  try {
    const config = await readNotificationConfig();
    if (config?.identityEpoch) await resetUnseenCount(config.identityEpoch);
  } catch {
    await clearNavigatorAppBadge();
    return;
  }
  await syncNavigatorAppBadge();
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
