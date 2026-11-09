import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiFingerprintLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { usePasskeySettings } from "#/features/home/hooks/use-passkey-settings";

/**
 * Settings' Passkey row: the account's passkey as clc-core records it, its
 * status as the row's value, and the explanation, error and action in a sheet.
 */
export function PasskeySettingsSection({
  address,
  isSigningOut,
}: {
  address?: `0x${string}`;
  isSigningOut: boolean;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const {
    passkey,
    badge,
    errorText,
    shownDescription,
    hasDetail,
    canLink,
    canSwitch,
    canRetryStatus,
  } = usePasskeySettings(address);
  // Adjusted during render rather than in an effect, so a sheet left open
  // when its detail runs out starts closing in the same commit.
  if (open && !hasDetail) setOpen(false);

  return (
    <>
      <ActionRow
        icon={<RiFingerprintLine className="size-4" aria-hidden="true" />}
        label={t`Passkey`}
        value={badge?.label}
        valueTone={badge?.linked ? "primary" : "default"}
        onClick={hasDetail ? () => setOpen(true) : undefined}
      />
      <SettingsSheet
        open={open}
        onOpenChange={setOpen}
        title={t`Passkey`}
        footer={
          canRetryStatus || canLink || canSwitch ? (
            <>
              {canRetryStatus ? (
                <Button
                  variant="outline"
                  tap
                  className="w-full"
                  pending={passkey.retryingStatus}
                  onClick={passkey.retryStatus}
                >
                  <Trans>Try again</Trans>
                </Button>
              ) : null}
              {canLink ? (
                <Button
                  tap
                  className="w-full"
                  onClick={passkey.link}
                  disabled={isSigningOut}
                  pending={passkey.busy}
                >
                  <RiFingerprintLine aria-hidden="true" />
                  {passkey.busy ? <Trans>Linking passkey…</Trans> : <Trans>Link a passkey</Trans>}
                </Button>
              ) : null}
              {canSwitch ? (
                <Button
                  tap
                  className="w-full"
                  onClick={passkey.retryConnection}
                  disabled={isSigningOut}
                  pending={passkey.busy}
                >
                  {passkey.busy ? <Trans>Connecting…</Trans> : <Trans>Retry connection</Trans>}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        <p className="text-muted-foreground text-sm empty:hidden" aria-live="polite">
          {shownDescription}
        </p>
        {errorText ? <SettingsSheetAlert>{errorText}</SettingsSheetAlert> : null}
      </SettingsSheet>
    </>
  );
}
