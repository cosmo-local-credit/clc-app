import type { WebAuthnCredentialSummary } from "@clc/api/features/auth/client";
import type { WebAuthnCredential } from "@clc/core/features/webauthn/index";

/**
 * What Settings can say about the wallet's passkeys.
 *
 * - `linked-here`     an active passkey whose credential this device holds.
 * - `linked-elsewhere` the account has an active passkey, but not on this
 *                     device as far as local storage knows; the paper card
 *                     still works and a second passkey cannot be added yet.
 * - `pending`         a registration is waiting on its transaction.
 * - `verifying`       only pre-tracking rows exist, awaiting clc-core's check.
 * - `available`       nothing usable is linked; a paper-wallet session may link.
 */
export type PasskeyAccountStatus =
  | { kind: "linked-here"; credentialId: string }
  | { kind: "linked-elsewhere" }
  | { kind: "pending"; trackingId: string | null }
  | { kind: "verifying" }
  | { kind: "available" };

/**
 * Derives the account's passkey status from clc-core's record.
 *
 * The backend list is the only source of "linked": local storage can say which
 * credential this device holds, never whether the account has one. Failed and
 * unverified rows are attempts that did not take, so they leave the account
 * available to link.
 */
export function derivePasskeyAccountStatus(
  address: `0x${string}`,
  credentials: readonly WebAuthnCredentialSummary[],
  local: WebAuthnCredential | null,
): PasskeyAccountStatus {
  const active = credentials.filter((credential) => credential.state === "active");
  if (active.length > 0) {
    const here =
      local && !local.stale && local.address.toLowerCase() === address.toLowerCase()
        ? active.find((credential) => credential.credentialId === local.credentialId)
        : undefined;
    return here
      ? { kind: "linked-here", credentialId: here.credentialId }
      : { kind: "linked-elsewhere" };
  }

  const pending = credentials.find((credential) => credential.state === "pending");
  if (pending) return { kind: "pending", trackingId: pending.trackingId };

  if (credentials.some((credential) => credential.state === "legacy")) return { kind: "verifying" };

  return { kind: "available" };
}
