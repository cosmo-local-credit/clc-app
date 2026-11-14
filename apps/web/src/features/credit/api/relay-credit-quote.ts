import type { CreditQuote, CreditQuoteRequest } from "@clc/api/features/credit-router/client";
import type { RelayerClient, RelayPayload } from "@clc/api/features/relayer/client";
import {
  type CreditQuoteCheck,
  type CreditReviewTerms,
  verifyCreditQuote,
} from "@clc/core/features/credit-router/logic";

import { relayIdempotently } from "#/features/key-rotation/api/relay-idempotently";
import {
  buildAuthorization,
  type CaliburSigner,
  signCaliburDigest,
} from "#/features/webauthn/api/relay-calibur-batch";

/** The quote failed a pre-signing check; nothing was signed. */
export class CreditQuoteRefusedError extends Error {
  constructor(
    readonly check: CreditQuoteCheck,
    readonly hop: number | null,
    detail: string,
  ) {
    super(detail);
    this.name = "CreditQuoteRefusedError";
  }
}

export type RelayCreditQuoteInput = {
  quote: CreditQuote;
  /** Exactly what was sent to the quote endpoint. */
  request: CreditQuoteRequest;
  /** What the review screen showed. */
  reviewed: CreditReviewTerms;
  wallet: `0x${string}`;
  signer: CaliburSigner;
  /** From the app's own configuration. */
  chainId: bigint;
  caliburAddress: `0x${string}`;
  /** From `/relayer/health`, which the app reads before every relay. */
  relayerAddress: `0x${string}`;
  nowSeconds: number;
};

/**
 * Checks a credit quote against the request and the review, signs the digest
 * the app computed itself, and relays it under an `operationId`.
 *
 * The server's digest is never signed. A first relay carries the wallet's
 * EIP-7702 authorization, which only the Sign-in Card's root key can give: a
 * passkey exists only on a wallet that has already delegated.
 */
export async function relayCreditQuote(
  input: RelayCreditQuoteInput,
  relayer: RelayerClient,
): Promise<{ trackingId: string }> {
  if (input.request.keyHash.toLowerCase() !== input.signer.keyHash.toLowerCase()) {
    throw new CreditQuoteRefusedError("signer", null, "the quote was asked for another key");
  }
  const verdict = verifyCreditQuote({
    request: input.request,
    reviewed: input.reviewed,
    quote: input.quote,
    wallet: input.wallet,
    chainId: input.chainId,
    caliburAddress: input.caliburAddress,
    relayerAddress: input.relayerAddress,
    nowSeconds: input.nowSeconds,
  });
  if (!verdict.ok) throw new CreditQuoteRefusedError(verdict.check, verdict.hop, verdict.detail);
  if (!input.quote.delegated && input.signer.kind !== "secp256k1") {
    throw new Error("This wallet must be set up with its Sign-in Card before a passkey can sign.");
  }

  const { signature, signatureType } = await signCaliburDigest(input.signer, verdict.digest);
  const authorization =
    !input.quote.delegated && input.signer.kind === "secp256k1"
      ? await buildAuthorization(input.signer.account, relayer)
      : undefined;
  const payload: RelayPayload = {
    userAddress: input.wallet,
    signedBatch: verdict.signedBatch,
    signature,
    signatureType,
    ...(authorization ? { authorization } : {}),
  };
  return { trackingId: await relayIdempotently(payload, relayer) };
}
