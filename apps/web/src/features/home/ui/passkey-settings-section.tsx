import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiFingerprintLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { SettingsSheet, SettingsSheetAlert } from "#/components/ui/settings-sheet";
import { useLinkPasskey } from "#/features/webauthn/hooks/use-link-passkey";

/**
 * Settings' Passkey row: the account's passkey as clc-core records it, its
 * status as the row's value, and the explanation, error and action in a sheet.
 *
 * "Google" / "Apple ID" is only the label of the platform prompt the device
 * will show; what gets linked is a platform passkey, not an OAuth account.
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
  const passkey = useLinkPasskey(address);
  const { state } = passkey;
  const { platformLabel } = passkey;

  let description: string | null = null;
  let badge: { label: string; linked: boolean } | null = null;
  switch (state.kind) {
    case "loading":
      description = t`Checking passkey status…`;
      badge = { label: t`Checking…`, linked: false };
      break;
    case "unavailable":
      description = t`Passkey status could not be checked.`;
      break;
    case "linked-here":
      description = passkey.isPasskeySession
        ? null
        : t`The passkey on this device is linked. Switch to it to sign with your passkey.`;
      badge = { label: t`Linked`, linked: true };
      break;
    case "linked-elsewhere":
      description = t`Your account has a passkey, but it is not on this device. Your sign-in card still works here. Adding another passkey is not available yet.`;
      badge = { label: t`Linked`, linked: true };
      break;
    case "pending":
      description = t`Confirming your passkey on the network. This can take a minute.`;
      badge = { label: t`Confirming`, linked: false };
      break;
    case "verifying":
      description = t`Your passkey is being verified.`;
      badge = { label: t`Checking…`, linked: false };
      break;
    case "available":
      description = !passkey.isPaperSession
        ? null
        : passkey.supported
          ? t`Link your passkey (${platformLabel})`
          : t`Linking a passkey works in Safari or Chrome on iPhone and Chrome on Android. Your sign-in card keeps working here.`;
      badge = { label: t`Not linked`, linked: false };
      break;
  }

  // Inline, not helpers taking `t`: the Lingui macro only rewrites the `t` bound
  // by useLingui() in this scope, and a passed-in `t` renders empty strings.
  let busyLabel: string;
  switch (passkey.step) {
    case "creating-passkey":
      busyLabel = t`Follow the prompt on your device…`;
      break;
    case "registering":
      busyLabel = t`Registering your passkey…`;
      break;
    case "confirming":
      busyLabel = t`Confirming your passkey on the network…`;
      break;
    case "connecting":
      busyLabel = t`Switching to your passkey…`;
      break;
    default:
      busyLabel = t`Preparing…`;
  }

  let errorText: string | null = null;
  switch (passkey.error?.kind) {
    case "missing-key":
      errorText = t`This device does not have the key from your sign-in card. Sign in with your card here, then link a passkey.`;
      break;
    case "identity-mismatch":
      errorText = t`Your wallet or session changed. Sign in again, then retry.`;
      break;
    case "cancelled":
      errorText = t`Passkey creation was cancelled. Your sign-in card is unchanged.`;
      break;
    case "unconfirmed":
      errorText = t`Your passkey is still confirming. You can keep using your sign-in card meanwhile.`;
      break;
    case "connection-failed":
      errorText = t`Your passkey is linked, but the app could not switch to it. Your sign-in card is still connected.`;
      break;
    case "failed":
      errorText = t`Linking the passkey failed. Your sign-in card is unchanged.`;
      break;
  }

  const canLink = state.kind === "available" && passkey.isPaperSession && passkey.supported;
  const canSwitch = state.kind === "linked-here" && passkey.isPaperSession;
  const canRetryStatus = state.kind === "unavailable";
  const shownDescription = passkey.busy ? busyLabel : description;
  // "Checking…" is all loading can say, and a passkey linked here in a passkey
  // session has nothing to add, so neither opens a sheet.
  const hasDetail =
    state.kind !== "loading" &&
    Boolean(shownDescription || errorText || canRetryStatus || canLink || canSwitch);
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
