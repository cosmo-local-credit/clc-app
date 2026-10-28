/**
 * SIWE sign-in, shared by every client that controls a key.
 *
 * The signer is injected rather than assumed. apps/web signs with a private key
 * recovered from a paper wallet in one place and with a wagmi connector in
 * another; apps/admin signs an operator in with a paper-wallet key. All three
 * need the same nonce -> message -> signature -> POST sequence, and getting the
 * order or the nonce lifetime wrong surfaces as a 400 from the backend rather
 * than a type error, so it is worth having in one place.
 *
 * The backend verifies the signature, checks it against the address claimed in
 * the message, and consumes the nonce (clc-core
 * internal/api/siwe_auth_handler.go). It does not validate `domain`, `uri` or
 * `statement` — those exist for the human reading the signature prompt, which is
 * why a console on a different origin needs no backend change to sign in.
 */

import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

import type { AuthClient, SigninResult } from "./client";

export type SiweSigner = {
  address: `0x${string}`;
  signMessage(message: string): Promise<`0x${string}`>;
};

export type SiweRequest = {
  /** Host shown in the signature prompt — `window.location.host` in a browser. */
  domain: string;
  /** Origin shown in the signature prompt — `window.location.origin`. */
  uri: string;
  chainId: number;
  /** Human-readable intent, e.g. "Sign in to the CLC admin console". */
  statement: string;
};

export type SignedSiweMessage = { message: string; signature: `0x${string}` };

/**
 * A signer backed by a raw private key — the paper-wallet path in both apps.
 *
 * The key never leaves the caller's process: it is used to derive the account
 * and sign, and is not sent to the backend, which recovers the address from the
 * signature instead.
 */
export function privateKeySigner(privateKey: `0x${string}`): SiweSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    signMessage: (message) => account.signMessage({ message }),
  };
}

/**
 * Fetches a nonce and returns the signed message.
 *
 * Separate from `signInWithSiwe` because signup needs the same signed message
 * alongside a name and email, and re-signing would consume a second nonce.
 */
export async function signSiweMessage(
  auth: AuthClient,
  signer: SiweSigner,
  request: SiweRequest,
): Promise<SignedSiweMessage> {
  const nonce = await auth.getSiweNonce();
  const message = createSiweMessage({
    domain: request.domain,
    address: signer.address,
    statement: request.statement,
    uri: request.uri,
    version: "1",
    chainId: request.chainId,
    nonce,
  });

  return { message, signature: await signer.signMessage(message) };
}

/**
 * Signs in and establishes the session cookie.
 *
 * An address with no account is registered first, under the paper-wallet
 * placeholders, so any key signs in; the holder fills in their profile later.
 *
 * Throws `BackendApiError`: 403 when the account is PENDING or REJECTED, 400 when
 * the signature or nonce is rejected, 409 (E17) when another account holds the
 * new address's placeholder email.
 */
export async function signInWithSiwe(
  auth: AuthClient,
  signer: SiweSigner,
  request: SiweRequest,
): Promise<SigninResult> {
  return auth.signinWithSiwe(await signSiweMessage(auth, signer, request));
}
