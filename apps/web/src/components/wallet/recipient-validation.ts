import { isSignInCardPayload } from "@clc/core/features/wallet/paper-wallet";

export function normalizePhone(value: string): string {
  return value.replace(/[+\s()-]/g, "");
}

/** An address is 40 hex digits. A following hex digit means this is a longer key. */
const SCANNED_ADDRESS = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;

export function normalizeScannedRecipient(value: string): string {
  const address = value.match(SCANNED_ADDRESS)?.[0];
  return address ?? value.trim();
}

export function acceptScannedRecipient(
  raw: string,
): { ok: true; value: string } | { ok: false; reason: "sign-in-card" } {
  if (isSignInCardPayload(raw)) return { ok: false, reason: "sign-in-card" };
  return { ok: true, value: normalizeScannedRecipient(raw) };
}

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isPhone(value: string): boolean {
  return /^\+?[0-9\s()-]*[0-9][0-9\s()-]*$/.test(value.trim());
}
