import {
  buildCancellationTransaction,
  buildExecuteSafeCall,
  buildSafeTransaction,
  computeSafeTxHash,
  safeReadAbi,
  type SafeCall,
  type SafeTransaction,
} from "@clc/core/features/safe/logic";
import type { SafeClient, SafeProposal } from "@clc/api/features/safe/client";
import type { RelayerClient } from "@clc/api/features/relayer/client";
import type { Client } from "viem";
import { readContract } from "viem/actions";
import { waitForOwnershipRelay } from "#/features/ownership/api/wait-for-ownership-relay";
import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { CHAIN_ID } from "#/lib/chain";
import { SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";
import { signSafeTransaction, type SignTypedData } from "./sign-safe-transaction";

/** A queued Safe transaction already sits at the Safe's next nonce. */
export class SafePendingConflictError extends Error {
  constructor(
    public safe: `0x${string}`,
    public safeTxHash: string,
  ) {
    super("This Safe already has a transaction waiting for signatures.");
  }
}

/** The proposal went to the other signers; nothing has executed yet. */
export class SafeProposedError extends Error {
  constructor(public proposal: SafeProposal) {
    super("Sent to the other signers for confirmation.");
  }
}

type Signer = {
  senderAddress: `0x${string}`;
  connectorId: string | undefined;
  includeAuthorization: boolean;
  sign: SignTypedData;
};

async function signAndPropose(
  deps: { safe: SafeClient },
  safe: `0x${string}`,
  signer: Signer,
  tx: SafeTransaction,
) {
  const signature = await signSafeTransaction({
    connectorId: signer.connectorId,
    safeAddress: safe,
    tx,
    sign: signer.sign,
  });
  return deps.safe.propose({
    safe,
    safeTxHash: computeSafeTxHash(CHAIN_ID, safe, tx),
    sender: signer.senderAddress,
    signature,
    tx,
  });
}

/**
 * Builds, signs and proposes one Safe transaction at the Safe's next nonce.
 *
 * One queued transaction per Safe applies to what this app submits: the Safe app
 * and other tools can queue at any nonce, so a pending transaction at the
 * current nonce stops a second proposal instead of racing it.
 */
export async function proposeSafeTransaction(
  deps: { chain: Client; safe: SafeClient },
  input: { safe: `0x${string}`; signer: Signer; calls: readonly SafeCall[] },
): Promise<SafeProposal> {
  const nonce = (
    await readContract(deps.chain, {
      address: input.safe,
      abi: safeReadAbi,
      functionName: "nonce",
    })
  ).toString();
  const queued = await deps.safe.pending(input.safe);
  const conflict = queued.find((tx) => tx.nonce === nonce && !tx.isExecuted);
  if (conflict) throw new SafePendingConflictError(input.safe, conflict.safeTxHash);

  const tx = buildSafeTransaction({
    calls: input.calls,
    nonce,
    multiSendCallOnly: SAFE_MULTISEND_CALL_ONLY[0]!,
  });
  return signAndPropose(deps, input.safe, input.signer, tx);
}

/**
 * Off-chain rejection cannot revoke signatures already given. Cancelling means
 * a competing zero-value self-call at the same nonce, which needs its own full
 * confirmation round; it is a separate proposal, not an edit of the original.
 */
export function proposeCancellation(
  deps: { safe: SafeClient },
  original: SafeProposal,
  signer: Signer,
) {
  const safe = original.safe as `0x${string}`;
  return signAndPropose(deps, safe, signer, buildCancellationTransaction(safe, original.nonce));
}

export async function confirmSafeTransaction(
  deps: { safe: SafeClient },
  proposal: SafeProposal,
  signer: Signer,
) {
  const signature = await signSafeTransaction({
    connectorId: signer.connectorId,
    safeAddress: proposal.safe as `0x${string}`,
    tx: proposal as SafeTransaction,
    sign: signer.sign,
  });
  return deps.safe.confirm(proposal.safeTxHash, signature);
}

/**
 * Executes through the existing gasless relay: the executing signer's Calibur
 * batch calls `Safe.execTransaction`, so the Safe is `msg.sender` to the asset
 * and the relayer pays gas. A revert leaves the Safe nonce unused and every
 * confirmation intact, so the same proposal can be executed again.
 */
export async function executeSafeTransaction(
  deps: { relayer: RelayerClient },
  proposal: SafeProposal,
  signer: Signer,
) {
  const call = buildExecuteSafeCall(
    proposal.safe as `0x${string}`,
    proposal as SafeTransaction,
    proposal.confirmations.map(({ owner, signature }) => ({ owner, signature })),
  );
  const { trackingId } = await relayCaliburBatch(
    {
      senderAddress: signer.senderAddress,
      connectorId: signer.connectorId,
      calls: [call],
      includeAuthorization: signer.includeAuthorization,
    },
    deps.relayer,
  );
  return waitForOwnershipRelay(deps.relayer, trackingId);
}
