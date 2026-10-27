import {
  buildSafeTransaction,
  computeSafeTxHash,
  safeReadAbi,
  type SafeCall,
} from "@clc/core/features/safe/logic";
import type { SafeClient, SafeProposal } from "@clc/api/features/safe/client";
import type { Client } from "viem";
import { readContract } from "viem/actions";
import { CHAIN_ID } from "#/lib/chain";
import { SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";
import { signSafeTransaction, type SignTypedData } from "./sign-safe-transaction";

export class SafePendingConflictError extends Error {
  constructor(
    public safe: `0x${string}`,
    public safeTxHash: string,
  ) {
    super("This multisig already has a transaction waiting for signatures.");
  }
}

/** Signals a successful proposal without pretending its on-chain action settled. */
export class SafeProposedError extends Error {
  constructor(public proposal: SafeProposal) {
    super("Proposal queued. Confirm and execute it in Safe.");
  }
}

/** Queueing is optional; the dashboard remains available for every failure. */
export class SafeDashboardRequiredError extends Error {
  constructor(
    public safe: `0x${string}`,
    detail?: string,
  ) {
    super(detail ?? "Create this transaction in the multisig wallet.");
  }
}

export async function proposeSafeTransaction(
  deps: { chain: Client; safe: SafeClient },
  input: {
    safe: `0x${string}`;
    signer: { senderAddress: `0x${string}`; connectorId: string | undefined; sign: SignTypedData };
    calls: readonly SafeCall[];
  },
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
  const multiSend = SAFE_MULTISEND_CALL_ONLY[0];
  if (input.calls.length > 1 && !multiSend) throw new SafeDashboardRequiredError(input.safe);
  const tx = buildSafeTransaction({
    calls: input.calls,
    nonce,
    multiSendCallOnly: multiSend ?? input.safe,
  });
  const signature = await signSafeTransaction({
    connectorId: input.signer.connectorId,
    safeAddress: input.safe,
    tx,
    sign: input.signer.sign,
    owner: input.signer.senderAddress,
    chain: deps.chain,
  });
  return deps.safe.propose({
    safe: input.safe,
    safeTxHash: computeSafeTxHash(CHAIN_ID, input.safe, tx),
    sender: input.signer.senderAddress,
    signature,
    tx,
  });
}
