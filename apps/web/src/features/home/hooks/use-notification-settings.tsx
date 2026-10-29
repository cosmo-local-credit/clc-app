import { Trans } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";

import { useNotificationCues } from "#/features/notifications/state/cue-preferences";
import {
  enableNotificationSubscription,
  type EnableNotificationSubscriptionResult,
  readNotificationSubscriptionSnapshot,
  type NotificationSubscriptionSnapshot,
} from "#/features/notifications/subscription/coordinator";

type NotificationSettingsState =
  | { status: "loading" }
  | { snapshot: NotificationSubscriptionSnapshot; status: "ready" }
  | { snapshot: NotificationSubscriptionSnapshot | null; status: "enabling" }
  | {
      message?: string;
      result: EnableNotificationSubscriptionResult;
      status: "result";
    };

/**
 * The push-notification setting: On, Off, Blocked or Unavailable, the reason
 * and, where it can help, Enable. Shared by the phone row and its sheet and the
 * desktop row and its popover.
 *
 * Checking and On have nothing more to say, so `hasDetail` is false for both.
 */
export function useNotificationSettings(walletAddress?: `0x${string}`) {
  const [state, setState] = useState<NotificationSettingsState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    void readNotificationSubscriptionSnapshot().then(
      (snapshot) => {
        if (active) setState({ snapshot, status: "ready" });
      },
      (error: unknown) => {
        if (active) {
          setState({
            message: errorMessage(error),
            result: {
              capability: unavailableCapability,
              error,
              status: "storage-unavailable",
            },
            status: "result",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    const snapshot = state.status === "ready" ? state.snapshot : null;
    setState({ snapshot, status: "enabling" });

    const result = await enableNotificationSubscription({
      currentWalletAddress: walletAddress,
    });
    setState({
      message: result.status === "failed" ? result.message : undefined,
      result,
      status: "result",
    });
  }

  const presentation = notificationSettingsPresentation(state);
  return {
    presentation,
    hasDetail: presentation.title !== undefined && !presentation.on,
    enabling: state.status === "enabling",
    enable,
  };
}

/**
 * The realtime session, and so the cue, runs for every signed-in wallet, with
 * or without push permission.
 */
export function useNotificationCuePreferences() {
  const sound = useNotificationCues((state) => state.sound);
  const vibration = useNotificationCues((state) => state.vibration);
  const setSound = useNotificationCues((state) => state.setSound);
  const setVibration = useNotificationCues((state) => state.setVibration);
  const canVibrate = typeof navigator.vibrate === "function";

  useEffect(() => {
    void useNotificationCues.persist.rehydrate();
  }, []);

  return { sound, vibration, setSound, setVibration, canVibrate };
}

type NotificationPresentation = {
  /** The row's value. */
  status: ReactNode;
  /** On has nothing to add, so its row is static; its title only covers the sheet's exit. */
  on?: boolean;
  /** The sheet's title; a state without one has nothing to open. */
  title?: ReactNode;
  description?: ReactNode;
  alert?: ReactNode;
  canEnable: boolean;
};

function notificationSettingsPresentation(
  state: NotificationSettingsState,
): NotificationPresentation {
  if (state.status === "loading") {
    return { status: <Trans>Checking…</Trans>, canEnable: false };
  }

  if (state.status === "enabling") {
    return {
      status: <Trans>Off</Trans>,
      canEnable: true,
      description: <Trans>Complete the browser permission prompt to continue.</Trans>,
      title: <Trans>Enabling notifications</Trans>,
    };
  }

  if (state.status === "result") {
    if (state.result.status === "enabled") {
      return enabledPresentation;
    }
    if (state.result.status === "install-required") {
      return installRequiredPresentation;
    }
    if (state.result.status === "permission-denied") {
      return permissionDeniedPresentation;
    }
    if (state.result.status === "unsupported") {
      return unsupportedPresentation;
    }
    if (state.result.status === "storage-unavailable") {
      return storageUnavailablePresentation;
    }

    return {
      status: <Trans>Off</Trans>,
      canEnable: true,
      alert: state.message || (
        <Trans>Registration failed. Check your connection and try again.</Trans>
      ),
      title: <Trans>Notifications could not be enabled</Trans>,
    };
  }

  if (state.snapshot.capability.status === "install-required") {
    return installRequiredPresentation;
  }
  if (state.snapshot.capability.status === "unsupported") {
    return unsupportedPresentation;
  }
  if (state.snapshot.capability.permission === "denied") {
    return permissionDeniedPresentation;
  }
  if (!state.snapshot.storageAvailable) {
    return storageUnavailablePresentation;
  }
  if (state.snapshot.capability.permission === "granted" && state.snapshot.subscription !== null) {
    return enabledPresentation;
  }

  return {
    status: <Trans>Off</Trans>,
    canEnable: true,
    title: <Trans>Notifications are off</Trans>,
  };
}

const enabledPresentation: NotificationPresentation = {
  status: <Trans>On</Trans>,
  on: true,
  canEnable: false,
  title: <Trans>Notifications are enabled</Trans>,
};

const installRequiredPresentation: NotificationPresentation = {
  status: <Trans>Off</Trans>,
  canEnable: false,
  description: (
    <Trans>
      Add CLC to your iPhone Home Screen, open the installed app, then enable notifications.
    </Trans>
  ),
  title: <Trans>Install the app first</Trans>,
};

const permissionDeniedPresentation: NotificationPresentation = {
  status: <Trans>Blocked</Trans>,
  canEnable: false,
  description: (
    <Trans>Notifications are blocked. Allow them in your browser or device settings.</Trans>
  ),
  title: <Trans>Notification permission denied</Trans>,
};

const unsupportedPresentation: NotificationPresentation = {
  status: <Trans>Unavailable</Trans>,
  canEnable: false,
  description: (
    <Trans>Notifications currently require Chrome on Android or the installed iPhone app.</Trans>
  ),
  title: <Trans>Notifications are unavailable</Trans>,
};

const storageUnavailablePresentation: NotificationPresentation = {
  status: <Trans>Unavailable</Trans>,
  canEnable: false,
  description: <Trans>This browser cannot store notification registration safely.</Trans>,
  title: <Trans>Notification storage is unavailable</Trans>,
};

const unavailableCapability: NotificationSubscriptionSnapshot["capability"] = {
  canRequestPermission: false,
  canSubscribe: false,
  hasNotification: false,
  hasPushManager: false,
  hasServiceWorker: false,
  isSecureContext: false,
  permission: "unavailable",
  platform: "unsupported",
  reasons: ["unsupported-platform"],
  status: "unsupported",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
