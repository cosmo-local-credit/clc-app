import { Trans } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiNotification3Line,
  RiSmartphoneLine,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
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

export function NotificationSettingsSection({ walletAddress }: { walletAddress?: `0x${string}` }) {
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

  async function handleEnable() {
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

  return (
    <section aria-labelledby="notification-settings-title" className="space-y-3">
      <h2 id="notification-settings-title">
        <Trans>Notifications</Trans>
      </h2>
      <div className="border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
            <presentation.Icon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{presentation.title}</p>
            <p className="mt-1 text-muted-foreground text-xs">{presentation.description}</p>
          </div>
        </div>

        {presentation.canEnable ? (
          <Button
            className="mt-4 h-11 w-full"
            disabled={state.status === "enabling"}
            onClick={() => {
              void handleEnable();
            }}
          >
            {state.status === "enabling" ? (
              <Trans>Enabling notifications...</Trans>
            ) : (
              <Trans>Enable notifications</Trans>
            )}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function notificationSettingsPresentation(state: NotificationSettingsState): {
  Icon: IconType;
  canEnable: boolean;
  description: ReactNode;
  title: ReactNode;
} {
  if (state.status === "loading") {
    return {
      Icon: RiNotification3Line,
      canEnable: false,
      description: <Trans>Checking notification support on this device.</Trans>,
      title: <Trans>Checking availability...</Trans>,
    };
  }

  if (state.status === "enabling") {
    return {
      Icon: RiNotification3Line,
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
      Icon: RiErrorWarningLine,
      canEnable: true,
      description: state.message || (
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
    Icon: RiNotification3Line,
    canEnable: true,
    description: <Trans>Receive voucher, swap, and off-ramp updates when the app is closed.</Trans>,
    title: <Trans>Notifications are off</Trans>,
  };
}

const enabledPresentation = {
  Icon: RiCheckboxCircleLine,
  canEnable: false,
  description: <Trans>This device is subscribed to wallet notifications.</Trans>,
  title: <Trans>Notifications are enabled</Trans>,
};

const installRequiredPresentation = {
  Icon: RiSmartphoneLine,
  canEnable: false,
  description: (
    <Trans>
      Add CLC to your iPhone Home Screen, open the installed app, then enable notifications.
    </Trans>
  ),
  title: <Trans>Install the app first</Trans>,
};

const permissionDeniedPresentation = {
  Icon: RiErrorWarningLine,
  canEnable: false,
  description: (
    <Trans>Notifications are blocked. Allow them in your browser or device settings.</Trans>
  ),
  title: <Trans>Notification permission denied</Trans>,
};

const unsupportedPresentation = {
  Icon: RiErrorWarningLine,
  canEnable: false,
  description: (
    <Trans>Notifications currently require Chrome on Android or the installed iPhone app.</Trans>
  ),
  title: <Trans>Notifications are unavailable</Trans>,
};

const storageUnavailablePresentation = {
  Icon: RiErrorWarningLine,
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
