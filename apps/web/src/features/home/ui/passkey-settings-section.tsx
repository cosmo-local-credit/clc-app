import { Trans, useLingui } from "@lingui/react/macro";
import { RiFingerprintLine, RiQrCodeLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { useLinkPasskey } from "#/features/webauthn/hooks/use-link-passkey";

/**
 * Settings' "Sign-in methods": the paper card, which always works, and the
 * account's passkey as clc-core records it.
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
  const passkey = useLinkPasskey(address);
  const { state } = passkey;
  const disabled = passkey.busy || isSigningOut;
  const { platformLabel } = passkey;

  let description: string;
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
        ? t`You are signed in with the passkey on this device.`
        : t`The passkey on this device is linked. Switch to it to sign with your passkey.`;
      badge = { label: t`Linked`, linked: true };
      break;
    case "linked-elsewhere":
      description = t`Your account has a passkey, but it is not on this device. Your paper card still works here. Adding another passkey is not available yet.`;
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
        ? t`No passkey is linked to this wallet.`
        : passkey.supported
          ? t`Sign in with your device's screen lock instead of your paper card. Your device will ask through ${platformLabel}.`
          : t`Linking a passkey works in Safari or Chrome on iPhone and Chrome on Android. Your paper wallet keeps working here.`;
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
      errorText = t`This device does not have your paper wallet key. Sign in with or import your paper wallet here, then link a passkey.`;
      break;
    case "identity-mismatch":
      errorText = t`Your wallet or session changed. Sign in again, then retry.`;
      break;
    case "cancelled":
      errorText = t`Passkey creation was cancelled. Your paper wallet is unchanged.`;
      break;
    case "unconfirmed":
      errorText = t`Your passkey is still confirming. You can keep using your paper wallet meanwhile.`;
      break;
    case "connection-failed":
      errorText = t`Your passkey is linked, but the app could not switch to it. Your paper wallet is still connected.`;
      break;
    case "failed":
      errorText = t`Linking the passkey failed. Your paper wallet is unchanged.`;
      break;
  }

  const canLink = state.kind === "available" && passkey.isPaperSession && passkey.supported;
  const canSwitch = state.kind === "linked-here" && passkey.isPaperSession;

  return (
    <section aria-labelledby="sign-in-methods-title" className="space-y-3">
      <h2 id="sign-in-methods-title">
        <Trans>Sign-in methods</Trans>
      </h2>
      <div className="border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
            <RiQrCodeLine className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">
              <Trans>Paper wallet card</Trans>
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              <Trans>Always works to sign in and recover this wallet. Keep it safe.</Trans>
            </p>
          </div>
        </div>

        <div className="-mx-4 my-3 h-px bg-border" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
              <RiFingerprintLine className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm">
                <Trans>Passkey</Trans>
              </p>
              <p className="mt-1 text-muted-foreground text-xs" aria-live="polite">
                {passkey.busy ? busyLabel : description}
              </p>
            </div>
          </div>
          {badge ? (
            <Badge variant={badge.linked ? "primary" : "muted"} className="self-center">
              {badge.label}
            </Badge>
          ) : null}
        </div>
      </div>

      {errorText ? (
        <p role="alert" className="text-destructive text-xs">
          {errorText}
        </p>
      ) : null}

      {state.kind === "unavailable" ? (
        <Button variant="outline" className="h-11 w-full" onClick={passkey.retryStatus}>
          <Trans>Try again</Trans>
        </Button>
      ) : null}

      {canLink ? (
        <Button className="h-11 w-full" onClick={passkey.link} disabled={disabled}>
          <RiFingerprintLine className="me-2 size-4" aria-hidden="true" />
          {passkey.busy ? <Trans>Linking passkey…</Trans> : <Trans>Link a passkey</Trans>}
        </Button>
      ) : null}

      {canSwitch ? (
        <Button className="h-11 w-full" onClick={passkey.retryConnection} disabled={disabled}>
          {passkey.busy ? <Trans>Connecting…</Trans> : <Trans>Retry connection</Trans>}
        </Button>
      ) : null}
    </section>
  );
}
