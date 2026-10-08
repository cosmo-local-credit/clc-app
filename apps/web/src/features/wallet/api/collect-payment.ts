import {
  isRelaySubmissionUncertain,
  RelayerError,
  type RelayerClient,
  type RelayerHealth,
  type RelayPayload,
} from "@clc/api/features/relayer/client";
import type { CollectIntent, CollectRejection } from "@clc/core/features/nfc/collect";
import { privateKeyToAccount } from "viem/accounts";

import { buildVoucherTransferCall } from "#/features/wallet/api/send-voucher-relay";
import { signCaliburBatchWithAccount } from "#/features/webauthn/api/relay-calibur-batch";

/**
 * Long enough for a slow relay and a few reconciliation retries; short enough
 * that a signed collection cannot sit around as a spendable authorization.
 */
export const COLLECT_DEADLINE_SECONDS = 5 * 60;

/** Past the deadline plus a block or two of slack, nothing signed can still land. */
const DEADLINE_SLACK_MS = 60_000;

export type CollectPaymentDeps = {
  relayer: RelayerClient;
  health: RelayerHealth;
  chainId: number;
  readBalance: (token: `0x${string}`, owner: `0x${string}`) => Promise<bigint>;
  readDelegated: (address: `0x${string}`) => Promise<boolean>;
  now: () => number;
};

export type PreparedCollectPayment =
  | { kind: "rejected"; reason: CollectRejection; detail?: string }
  | { kind: "signed"; request: RelayPayload; expiresAt: number };

/**
 * Validates and signs one collection as the payer, without sending it.
 *
 * The payer's key is a transient signer: it is never stored as an identity,
 * never connected to wagmi, and never sent anywhere — only the signature over
 * this one `transfer(collector, amount)` leaves the device. The transfer runs
 * from the payer's own wallet, so no allowance is involved.
 *
 * Balance and delegation are read for the payer's explicit address, in
 * parallel; the network's own checks at submission and settlement stay
 * authoritative. A wallet never used before is not yet delegated to Calibur,
 * so its first collection carries the EIP-7702 authorization.
 */
export async function prepareCollectPayment(
  intent: CollectIntent,
  payerKey: `0x${string}`,
  deps: CollectPaymentDeps,
): Promise<PreparedCollectPayment> {
  if (deps.health.chainId !== deps.chainId) return { kind: "rejected", reason: "chain-mismatch" };
  if (!deps.health.relayerAddress) {
    return { kind: "rejected", reason: "failed", detail: "Relayer has no executor address." };
  }
  const account = privateKeyToAccount(payerKey);
  if (account.address.toLowerCase() === intent.collector.toLowerCase()) {
    return { kind: "rejected", reason: "self-payment" };
  }

  const [balance, delegated] = await Promise.all([
    deps.readBalance(intent.token.address, account.address),
    deps.readDelegated(account.address),
  ]);
  if (balance < BigInt(intent.amountRaw))
    return { kind: "rejected", reason: "insufficient-balance" };

  const deadlineSeconds = Math.floor(deps.now() / 1000) + COLLECT_DEADLINE_SECONDS;
  const signed = await signCaliburBatchWithAccount(
    {
      account,
      senderAddress: account.address,
      calls: [
        buildVoucherTransferCall({
          tokenAddress: intent.token.address,
          recipientAddress: intent.collector,
          amountRaw: intent.amountRaw,
        }),
      ],
      includeAuthorization: !delegated,
      deadline: String(deadlineSeconds),
      executor: deps.health.relayerAddress as `0x${string}`,
    },
    deps.relayer,
  );
  return {
    kind: "signed",
    request: { ...signed, operationId: intent.id },
    expiresAt: deadlineSeconds * 1000 + DEADLINE_SLACK_MS,
  };
}

export type CollectSubmissionResult =
  | { kind: "submitted"; trackingId: string }
  | { kind: "uncertain" }
  | { kind: "rejected"; detail: string; conflict: boolean };

/** Sends a signed collection and says plainly whether its fate is known. */
export async function submitCollectRequest(
  request: RelayPayload,
  relayer: RelayerClient,
): Promise<CollectSubmissionResult> {
  try {
    const { result } = await relayer.relay(request);
    return { kind: "submitted", trackingId: result.trackingId };
  } catch (error) {
    if (isRelaySubmissionUncertain(error)) return { kind: "uncertain" };
    return {
      kind: "rejected",
      detail: error instanceof RelayerError ? error.description : String(error),
      conflict: error instanceof RelayerError && error.status === 409,
    };
  }
}

export type ReconcileResult =
  | { kind: "submitted"; trackingId: string }
  | { kind: "rejected"; detail: string }
  | { kind: "unknown" }
  | { kind: "aborted" };

const RECONCILE_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];
const RECONCILE_STEADY_MS = 10_000;

/**
 * Finds out what happened to a submission whose answer was lost, by resending
 * the identical signed request under its operation id. An idempotent relay
 * answers a duplicate with the original tracking id, or queues it once if the
 * first never arrived. Nothing here ever signs again.
 *
 * A 409 means the id is bound to a different request — not this one, so not
 * proof of anything — and is reported as unknown rather than rejected. Past
 * the deadline the request can no longer execute, which ends the search.
 */
export async function reconcileCollectRequest(
  request: RelayPayload,
  expiresAt: number,
  deps: {
    relayer: RelayerClient;
    now: () => number;
    sleep: (ms: number, signal: AbortSignal) => Promise<void>;
    signal: AbortSignal;
  },
): Promise<ReconcileResult> {
  for (let attempt = 0; ; attempt += 1) {
    if (deps.signal.aborted) return { kind: "aborted" };
    if (deps.now() >= expiresAt) return { kind: "unknown" };
    const result = await submitCollectRequest(request, deps.relayer);
    if (deps.signal.aborted) return { kind: "aborted" };
    if (result.kind === "submitted") return result;
    if (result.kind === "rejected") {
      return result.conflict ? { kind: "unknown" } : { kind: "rejected", detail: result.detail };
    }
    try {
      await deps.sleep(RECONCILE_BACKOFF_MS[attempt] ?? RECONCILE_STEADY_MS, deps.signal);
    } catch {
      return { kind: "aborted" };
    }
  }
}
