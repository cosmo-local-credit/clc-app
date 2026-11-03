import type {
  AuthClient,
  KeyRotationPayload,
  KeyRotationResult,
} from "@clc/api/features/auth/client";
import { privateKeySigner, type SiweRequest, signSiweMessage } from "@clc/api/features/auth/siwe";
import {
  buildKeyRotationStatement,
  keyRotationPasskeyChallenge,
} from "@clc/core/features/key-rotation/logic";
import { privateKeyToAccount } from "viem/accounts";

import { collectWebAuthnAssertionFor } from "#/features/webauthn/hooks/assertion";

/**
 * How the old card proves the replacement is wanted. clc-core refuses the old
 * card's signature alone when the account has an active passkey: whoever
 * copied the card does not hold the passkey.
 */
type OldCardProof = { kind: "card"; key: `0x${string}` } | { kind: "passkey" };

export type ReplaceSignInCardInput = {
  auth: AuthClient;
  oldAddress: `0x${string}`;
  newKey: `0x${string}`;
  proof: OldCardProof;
  /** Where the SIWE prompt says it comes from; `statement` is fixed here. */
  siwe: Omit<SiweRequest, "statement">;
};

/**
 * Moves the account from the old card to the new one.
 *
 * Both proofs commit to the same statement naming both addresses, each over
 * its own nonce. The response sets the new card's session cookie; the old card's
 * session, on any device, stops working when this resolves.
 */
export async function replaceSignInCard(input: ReplaceSignInCardInput): Promise<KeyRotationResult> {
  const newAddress = privateKeyToAccount(input.newKey).address;
  const statement = buildKeyRotationStatement(input.oldAddress, newAddress);
  const request: SiweRequest = { ...input.siwe, statement };

  let old: KeyRotationPayload["old"];
  if (input.proof.kind === "card") {
    const signer = privateKeySigner(input.proof.key);
    if (signer.address.toLowerCase() !== input.oldAddress.toLowerCase()) {
      throw new Error("The old sign-in card does not match this account.");
    }
    old = { siwe: await signSiweMessage(input.auth, signer, request) };
  } else {
    // Bound to this replacement: the passkey signs a challenge that commits to
    // both cards, over a nonce clc-core spends when it accepts the assertion.
    const nonce = await input.auth.getSiweNonce();
    old = {
      webauthn: await collectWebAuthnAssertionFor(keyRotationPasskeyChallenge(statement, nonce)),
      nonce,
    };
  }
  const proof = await signSiweMessage(input.auth, privateKeySigner(input.newKey), request);
  return input.auth.rotateKey({ old, new: proof });
}
