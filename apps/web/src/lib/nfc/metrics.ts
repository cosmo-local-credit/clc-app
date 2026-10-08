/**
 * Pilot instrumentation for NFC flows, as User Timing marks only: visible in
 * DevTools and to a test harness on the device, never sent anywhere.
 *
 * The detail carries an anonymous operation id and nothing else — never a key,
 * a card payload, or an address.
 */
export type NfcStage =
  | "ready"
  | "event"
  | "decoded"
  | "login-started"
  | "login-completed"
  | "relay-preview"
  | "relay-signed"
  | "relay-submitted"
  | "tracking-confirmed"
  | "tracking-failed";

export function markNfc(operationId: string, stage: NfcStage): void {
  try {
    performance.mark(`clc-nfc:${stage}`, { detail: { operationId } });
  } catch {
    // Marks are best effort; a missing User Timing API must not break a payment.
  }
}
