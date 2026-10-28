import type { RelayerClient } from "@clc/api/features/relayer/client";
import {
  base64UrlToBytes,
  type CaliburCall,
  eip7702AuthMessage,
  encodeWebAuthnAuth,
  normalizeS,
  parseDERSignature,
} from "@clc/core/features/webauthn/index";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";
import { encodeAbiParameters, hexToBytes, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CHAIN_ID, CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";
import { getOperatorKey, type OperatorKey } from "./operator-key";

/**
 * Relays one batch of contract calls signed by whichever key the operator loaded.
 *
 * The same two-step the app uses: ask the relayer to preview the batch, which
 * returns the nonce it will use and the EIP-712 digest to sign, then send the
 * signature back with the batch. Nothing here builds calldata — the calls come
 * from @clc/core — and nothing here decides what the operator may do; clc-core
 * gates the endpoint and the contracts gate the caller.
 *
 * Like apps/web's `relayCaliburBatch`, a paper-wallet key can be restored from
 * `localStorage`. Passkey signing records remain memory-only and therefore need
 * to be collected again after a reload.
 *
 * The EIP-7702 authorization is attached on every paper-wallet relay rather than
 * only when the account needs it. apps/web can be selective because it reads the
 * EOA's bytecode over an RPC to see whether it is already delegated; this console
 * has no chain client, and clc-core rejects the job outright — "user not
 * delegated and no authorization supplied" — for an operator who has only ever
 * signed in here. Supplying it unconditionally costs one nonce read and one
 * signature: the relay worker checks delegation itself and builds a plain
 * transaction, ignoring the authorization, whenever the account already
 * delegates. A passkey needs none, because a credential can only exist on an
 * account that is already a Calibur account.
 */

export type RelayBatchResult = {
  trackingId: string;
  signatureType: "secp256k1" | "webauthn";
};

/** Calibur reads a zero key hash as "the root secp256k1 key of this account". */
const ROOT_KEY_HASH = `0x${"00".repeat(32)}` as const;

/** No expiry. The relayer dispatches immediately and clc-core tracks the OTX. */
const NO_DEADLINE = "0";
const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);

export async function relayOperatorBatch(
  calls: CaliburCall[],
  client: RelayerClient,
): Promise<RelayBatchResult> {
  const key = getOperatorKey();
  if (!key) {
    throw new Error(
      "No signing key in this session. Sign in again with your sign-in card or passkey to sign.",
    );
  }

  const batchedCall = { calls, revertOnFailure: true };
  const executor = await relayerExecutor(client);

  if (key.kind === "passkey") {
    return relayWithPasskey(key, batchedCall, executor, client);
  }
  return relayWithPrivateKey(key, batchedCall, executor, client);
}

type BatchedCall = { calls: CaliburCall[]; revertOnFailure: boolean };

async function relayerExecutor(client: RelayerClient): Promise<`0x${string}`> {
  const {
    result: { relayerAddress },
  } = await client.getHealth();
  if (!relayerAddress) throw new Error("Relayer health response is missing relayerAddress.");
  return relayerAddress as `0x${string}`;
}

async function relayWithPasskey(
  key: Extract<OperatorKey, { kind: "passkey" }>,
  batchedCall: BatchedCall,
  executor: `0x${string}`,
  client: RelayerClient,
): Promise<RelayBatchResult> {
  const { credential } = key;
  if (credential.stale) throw new Error("Passkey credential is stale; sign in again.");

  const preview = await client.relayPreview({
    userAddress: credential.address,
    batchedCall,
    keyHash: credential.keyHash,
    executor,
    deadline: NO_DEADLINE,
  });

  const signature = await signDigestWithPasskey(preview.result.digest, credential.credentialId);
  const { result } = await client.relay({
    userAddress: credential.address,
    signedBatch: {
      batchedCall,
      nonce: preview.result.nonce,
      keyHash: credential.keyHash,
      executor,
      deadline: NO_DEADLINE,
    },
    signature,
    signatureType: "webauthn",
  });

  return { trackingId: result.trackingId, signatureType: "webauthn" };
}

async function relayWithPrivateKey(
  key: Extract<OperatorKey, { kind: "privateKey" }>,
  batchedCall: BatchedCall,
  executor: `0x${string}`,
  client: RelayerClient,
): Promise<RelayBatchResult> {
  const account = privateKeyToAccount(key.privateKey);

  const preview = await client.relayPreview({
    userAddress: account.address,
    batchedCall,
    keyHash: ROOT_KEY_HASH,
    executor,
    deadline: NO_DEADLINE,
  });

  const rawSignature = await account.sign({ hash: preview.result.digest });
  const authorization = await signDelegation(account, client);
  const { result } = await client.relay({
    userAddress: account.address,
    signedBatch: {
      batchedCall,
      nonce: preview.result.nonce,
      keyHash: ROOT_KEY_HASH,
      executor,
      deadline: NO_DEADLINE,
    },
    // Calibur reads the outer tuple as (signature, hook data); the console
    // passes no hook data.
    signature: encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [rawSignature, "0x"]),
    signatureType: "secp256k1",
    authorization,
  });

  return { trackingId: result.trackingId, signatureType: "secp256k1" };
}

/**
 * The EIP-7702 authorization that lets the relayer point this EOA at Calibur.
 *
 * Signed over the account's own transaction nonce, so it is single-use and
 * cannot be replayed once the delegation lands.
 */
async function signDelegation(
  account: ReturnType<typeof privateKeyToAccount>,
  client: RelayerClient,
) {
  const {
    result: { nonce },
  } = await client.getEOANonce(account.address);

  const signature = parseSignature(
    await account.sign({
      hash: eip7702AuthMessage({
        chainId: CHAIN_ID_BIGINT,
        contractAddress: CALIBUR_ADDRESS,
        nonce: BigInt(nonce),
      }),
    }),
  );

  return {
    chainId: CHAIN_ID.toString(),
    contractAddress: CALIBUR_ADDRESS,
    nonce: String(nonce),
    yParity: Number(signature.yParity),
    r: signature.r,
    s: signature.s,
  };
}

/**
 * A WebAuthn assertion over the relayer's digest, encoded the way Calibur
 * verifies it.
 *
 * The digest is the challenge, so the authenticator signs the batch itself
 * rather than a nonce standing in for it. The indices point Calibur at the two
 * fields it re-reads out of `clientDataJSON`, and `s` is normalized to the lower
 * half of the curve order because the contract rejects the malleable form.
 */
async function signDigestWithPasskey(
  digest: `0x${string}`,
  credentialId: string,
): Promise<`0x${string}`> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(hexToBytes(digest)),
      rpId: RELYING_PARTY_ID,
      allowCredentials: [{ id: toArrayBuffer(base64UrlToBytes(credentialId)), type: "public-key" }],
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Passkey prompt was dismissed.");

  const response = assertion.response as AuthenticatorAssertionResponse;
  const { r, s } = parseDERSignature(new Uint8Array(response.signature));
  const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
  const typeIndex = clientDataJSON.indexOf('"type"');
  const challengeIndex = clientDataJSON.indexOf('"challenge"');
  if (typeIndex === -1 || challengeIndex === -1) throw new Error("Malformed clientDataJSON.");

  const webAuthnSignature = encodeWebAuthnAuth({
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON,
    challengeIndex: BigInt(challengeIndex),
    typeIndex: BigInt(typeIndex),
    r: bytesToBigInt(r),
    s: bytesToBigInt(normalizeS(s)),
  });

  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [webAuthnSignature, "0x"]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}
