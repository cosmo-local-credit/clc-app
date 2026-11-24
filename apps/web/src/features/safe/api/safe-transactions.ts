import {
  buildSafeTransaction,
  computeSafeTxHash,
  safeReadAbi,
  type SafeCall,
} from "@clc/core/features/safe/logic";
import type { SafeClient, SafeProposal } from "@clc/api/features/safe/client";
import { isSafeMonthlyQuotaError } from "@clc/api/features/safe/queries";
import { BackendApiError } from "@clc/api/client/errors";
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

/** The action cannot be prepared or signed in CLC. */
export class SafeDashboardRequiredError extends Error {
  constructor(
    public safe: `0x${string}`,
    detail?: string,
  ) {
    super(detail ?? "Create this transaction in the multisig wallet.");
  }
}

export function safeQueueFailureKind(error: unknown): "session" | "signer" | "quota" | "temporary" {
  if (isSafeMonthlyQuotaError(error)) return "quota";
  if (error instanceof BackendApiError) {
    if (error.kind === "unauthenticated") return "session";
    if (error.kind === "forbidden") return "signer";
  }
  return "temporary";
}

/** The proposal was stopped before signing or explicitly rejected by the API. */
export class SafeProposalError extends Error {
  constructor(
    public safe: `0x${string}`,
    public stage: "check" | "rejected",
    cause: unknown,
  ) {
    super("Multisig proposal could not be submitted.", { cause });
  }
}

/** The signed write may have reached Safe. Only inspect the existing proposal. */
export class SafeProposalOutcomeUnknownError extends Error {
  constructor(
    public safe: `0x${string}`,
    public safeTxHash: `0x${string}`,
    cause: unknown,
  ) {
    super("Multisig proposal submission could not be verified.", { cause });
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
  let nonce: string;
  let queued: SafeProposal[];
  try {
    nonce = (
      await readContract(deps.chain, {
        address: input.safe,
        abi: safeReadAbi,
        functionName: "nonce",
      })
    ).toString();
    queued = await deps.safe.pending(input.safe);
  } catch (error) {
    throw new SafeProposalError(input.safe, "check", error);
  }
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
  const safeTxHash = computeSafeTxHash(CHAIN_ID, input.safe, tx);
  try {
    return await deps.safe.propose({
      safe: input.safe,
      safeTxHash,
      sender: input.signer.senderAddress,
      signature,
      tx,
    });
  } catch (error) {
    if (
      error instanceof BackendApiError &&
      (error.kind === "validation" ||
        error.kind === "unauthenticated" ||
        error.kind === "forbidden")
    ) {
      throw new SafeProposalError(input.safe, "rejected", error);
    }
    // Core may have posted the signature successfully and failed to read the
    // result back. A missing or unavailable record still leaves that outcome
    // unknown. Preserve the original hash and leave further writes to the user.
    const recorded = await deps.safe.transaction(safeTxHash).catch(() => null);
    if (
      recorded?.safeTxHash.toLowerCase() === safeTxHash.toLowerCase() &&
      recorded.safe.toLowerCase() === input.safe.toLowerCase() &&
      recorded.confirmations.some(
        ({ owner }) => owner.toLowerCase() === input.signer.senderAddress.toLowerCase(),
      )
    ) {
      return recorded;
    }
    throw new SafeProposalOutcomeUnknownError(input.safe, safeTxHash, error);
  }
}
