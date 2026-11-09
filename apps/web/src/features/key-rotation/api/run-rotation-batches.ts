import type { RotationBatch } from "@clc/core/features/key-rotation/logic";
import type { RelayerClient, RelayPayload } from "@clc/api/features/relayer/client";
import { privateKeyToAccount } from "viem/accounts";

import {
  waitForOwnershipRelay,
  OwnershipSettlementError,
} from "#/features/ownership/api/wait-for-ownership-relay";
import { readCaliburDelegation } from "#/features/webauthn/api/calibur-delegation";
import {
  signCaliburBatchWithAccount,
  signCaliburBatchWithPasskey,
} from "#/features/webauthn/api/relay-calibur-batch";

import type { OldCardSigner } from "../state/rotation-session";
import { relayIdempotently } from "./relay-idempotently";

export type BatchProgress = "signing" | "confirming" | "moved" | "failed";

export type RotationRunResult = {
  /** Batches that settled successfully, by index. */
  moved: number[];
  /** Batches that reverted; the rest still ran. */
  failed: number[];
  /**
   * A batch was accepted but did not settle in time. Nothing after it ran:
   * the next batch would reuse its Calibur nonce until it lands.
   */
  uncertainTrackingId: string | null;
};

/**
 * Signs and relays each batch as the old wallet, one at a time.
 *
 * One at a time because the relay preview reads the account's Calibur sequence
 * from chain: a batch signed before the previous one lands reuses its nonce and
 * reverts. A response lost in transit is resent as the identical signed request
 * under its `operationId`, never signed again. Without an idempotent relayer
 * the resend still cannot run twice — the second copy carries a spent nonce.
 */
export async function runRotationBatches(input: {
  batches: RotationBatch[];
  from: `0x${string}`;
  signer: OldCardSigner;
  relayer: RelayerClient;
  onProgress?: (index: number, progress: BatchProgress) => void;
}): Promise<RotationRunResult> {
  const { batches, from, signer, relayer } = input;
  const result: RotationRunResult = { moved: [], failed: [], uncertainTrackingId: null };
  if (batches.length === 0) return result;

  const {
    result: { relayerAddress },
  } = await relayer.getHealth();
  if (!relayerAddress) throw new Error("Relayer health response is missing relayerAddress");
  const executor = relayerAddress as `0x${string}`;
  // A passkey is only ever registered on a delegated wallet.
  let delegated = signer.kind === "passkey" || (await readCaliburDelegation(from));

  for (const [index, batch] of batches.entries()) {
    input.onProgress?.(index, "signing");
    const payload: RelayPayload =
      signer.kind === "card"
        ? await signCaliburBatchWithAccount(
            {
              account: privateKeyToAccount(signer.key),
              senderAddress: from,
              calls: batch.calls,
              includeAuthorization: !delegated,
              deadline: "0",
              executor,
            },
            relayer,
          )
        : await signCaliburBatchWithPasskey(
            {
              credentialId: signer.credentialId,
              keyHash: signer.keyHash,
              senderAddress: from,
              calls: batch.calls,
              deadline: "0",
              executor,
            },
            relayer,
          );
    const trackingId = await relayIdempotently(payload, relayer);
    const carriedAuthorization = !delegated;

    input.onProgress?.(index, "confirming");
    try {
      await waitForOwnershipRelay(relayer, trackingId);
      delegated = true;
      result.moved.push(index);
      input.onProgress?.(index, "moved");
    } catch (error) {
      if (error instanceof OwnershipSettlementError && !error.terminal) {
        result.uncertainTrackingId = trackingId;
        return result;
      }
      result.failed.push(index);
      // A reverted call keeps the delegation its authorization set; a dropped
      // transaction does not. Ask the chain, so the next batch carries the
      // authorization exactly when the wallet still needs one.
      if (carriedAuthorization) delegated = await readCaliburDelegation(from).catch(() => false);
      input.onProgress?.(index, "failed");
    }
  }
  return result;
}
