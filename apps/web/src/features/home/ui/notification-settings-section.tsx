import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";
import { RiLoader4Line, RiNotification3Line } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
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
 * Settings row for push notifications: On, Off, Blocked or Unavailable at a
 * glance, and a sheet with the reason and, where it can help, Enable.
 *
 * Checking and On have nothing more to say, so the row is static for both and
 * a sheet left open when notifications come on closes with it.
 */
export function NotificationSettingsSection({ walletAddress }: { walletAddress?: `0x${string}` }) {
  const { t } = useLingui();
  const [state, setState] = useState<NotificationSettingsState>({ status: "loading" });
  const [open, setOpen] = useState(false);

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
  const hasDetail = presentation.title !== undefined && !presentation.on;
  // Adjusted during render rather than in an effect, so the sheet starts
  // closing in the same commit that turns notifications on.
  if (open && !hasDetail) setOpen(false);

  return (
    <>
      <ActionRow
        icon={<RiNotification3Line className="size-4" aria-hidden="true" />}
        label={t`Notifications`}
        value={presentation.status}
        valueTone={presentation.on ? "primary" : "default"}
        onClick={hasDetail ? () => setOpen(true) : undefined}
      />
      <SettingsSheet
        open={open}
        onOpenChange={setOpen}
        title={presentation.title}
        footer={
          presentation.canEnable ? (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={state.status === "enabling"}
              onClick={() => {
                void handleEnable();
              }}
            >
              {state.status === "enabling" ? (
                <>
                  <RiLoader4Line className="animate-spin" aria-hidden="true" />
                  <Trans>Enabling notifications…</Trans>
                </>
              ) : (
                <>
                  <RiNotification3Line aria-hidden="true" />
                  <Trans>Enable notifications</Trans>
                </>
              )}
            </Button>
          ) : null
        }
      >
        {presentation.description ? (
          <p className="text-muted-foreground text-sm">{presentation.description}</p>
        ) : null}
        {presentation.alert ? <SettingsSheetAlert>{presentation.alert}</SettingsSheetAlert> : null}
      </SettingsSheet>
    </>
  );
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
