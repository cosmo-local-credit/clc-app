import {
  isRelaySubmissionUncertain,
  type RelayerClient,
  type RelayPayload,
} from "@clc/api/features/relayer/client";

const RESEND_ATTEMPTS = 3;

/**
 * Relays one signed request under a fresh `operationId`, resending the identical
 * request when the outcome is unknown. Never signs again: a second signature
 * would be a second transaction.
 */
export async function relayIdempotently(
  payload: RelayPayload,
  relayer: RelayerClient,
): Promise<string> {
  const request = { ...payload, operationId: payload.operationId ?? crypto.randomUUID() };
  for (let attempt = 1; ; attempt += 1) {
    try {
      return (await relayer.relay(request)).result.trackingId;
    } catch (error) {
      if (!isRelaySubmissionUncertain(error) || attempt >= RESEND_ATTEMPTS) throw error;
    }
  }
}
