import { useLingui } from "@lingui/react/macro";

import { useLinkPasskey } from "#/features/webauthn/hooks/use-link-passkey";

/**
 * The account's passkey as clc-core records it, read for a settings row: its
 * badge, the explanation, error and the actions that apply. Shared by the
 * phone row and its sheet and the desktop row and its popover.
 *
 * "Google" / "Apple ID" is only the label of the platform prompt the device
 * will show; what gets linked is a platform passkey, not an OAuth account.
 */
export function usePasskeySettings(address?: `0x${string}`) {
  const { t } = useLingui();
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
        ? null
        : passkey.supported
          ? t`Link your passkey (${platformLabel})`
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
  const canRetryStatus = state.kind === "unavailable";
  const shownDescription = passkey.busy ? busyLabel : description;
  // "Checking…" is all loading can say, and a passkey linked here in a passkey
  // session has nothing to add, so neither opens a sheet.
  const hasDetail =
    state.kind !== "loading" &&
    Boolean(shownDescription || errorText || canRetryStatus || canLink || canSwitch);

  return {
    passkey,
    badge,
    errorText,
    shownDescription,
    hasDetail,
    canLink,
    canSwitch,
    canRetryStatus,
  };
}
