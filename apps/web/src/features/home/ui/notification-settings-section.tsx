import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiNotification3Line, RiPulseLine, RiVolumeUpLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { Switch } from "#/components/ui/switch";
import {
  useNotificationCuePreferences,
  useNotificationSettings,
} from "#/features/home/hooks/use-notification-settings";

/**
 * Settings row for push notifications: On, Off, Blocked or Unavailable at a
 * glance, and a sheet with the reason and, where it can help, Enable.
 *
 * Checking and On have nothing more to say, so the row is static for both and
 * a sheet left open when notifications come on closes with it.
 */
export function NotificationSettingsSection({ walletAddress }: { walletAddress?: `0x${string}` }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { presentation, hasDetail, enabling, enable } = useNotificationSettings(walletAddress);
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
              tap
              className="w-full"
              pending={enabling}
              onClick={() => {
                void enable();
              }}
            >
              <RiNotification3Line aria-hidden="true" />
              {enabling ? (
                <Trans>Enabling notifications…</Trans>
              ) : (
                <Trans>Enable notifications</Trans>
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
      {walletAddress ? <NotificationCueRows /> : null}
    </>
  );
}

function NotificationCueRows() {
  const { t } = useLingui();
  const { sound, vibration, setSound, setVibration, canVibrate } = useNotificationCuePreferences();

  return (
    <>
      <ActionRow
        icon={<RiVolumeUpLine className="size-4" aria-hidden="true" />}
        label={t`Sound`}
        value={<Switch checked={sound} onCheckedChange={setSound} aria-label={t`Sound`} />}
      />
      {canVibrate ? (
        <ActionRow
          icon={<RiPulseLine className="size-4" aria-hidden="true" />}
          label={t`Vibration`}
          value={
            <Switch checked={vibration} onCheckedChange={setVibration} aria-label={t`Vibration`} />
          }
        />
      ) : null}
    </>
  );
}
