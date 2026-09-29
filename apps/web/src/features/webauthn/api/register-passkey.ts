import {
  base64UrlToBytes,
  computeEIP712Digest,
  eip7702AuthMessage,
  encodeRegisterCalldata,
  webAuthnKeyHash,
} from "@clc/core/features/webauthn/index";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";
import { bytesToHex, encodeAbiParameters, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { RelayerClient } from "@clc/api/features/relayer/client";
import { readCaliburDelegation } from "#/features/webauthn/api/calibur-delegation";
import { assertWebAuthnSupported } from "#/features/webauthn/hooks/browser-support";
import { createWebAuthnPasskey } from "#/features/webauthn/hooks/credential";
import { CHAIN_ID, CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";

const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);
const RELYING_PARTY_NAME = import.meta.env.VITE_RELYING_PARTY_NAME ?? "CLC";
const ROOT_KEY_HASH = `0x${"00".repeat(32)}` as `0x${string}`;

export type PasskeyRegistrationStep = "authorizing" | "creating-passkey" | "registering";

/** A registration the relayer accepted. Nothing here is usable until `trackingId` succeeds. */
export type PasskeyRegistration = {
  trackingId: string;
  credentialId: string;
  keyHash: `0x${string}`;
  publicKeyX: string;
  publicKeyY: string;
  address: `0x${string}`;
};

/**
 * Creates a platform passkey and relays the root-signed Calibur `register`
 * self-call that adds it to the wallet `privateKey` controls.
 *
 * Shared by onboarding, which passes the key it just generated, and Settings,
 * which passes the paper-wallet key it has already matched to the session. The
 * key never leaves this function: the relayer receives only the signed batch
 * and, for a wallet not yet delegated, the EIP-7702 authorization.
 *
 * Delegation is read before anything is signed. clc-core ignores an
 * authorization for a wallet that already delegates to Calibur — true of any
 * paper wallet that has sent a transaction — so none is requested for it.
 *
 * Resolves once the relayer accepts the batch; the caller follows `trackingId`
 * to confirmation. clc-core keeps the credential pending until then.
 */
export async function registerPasskey(
  privateKey: `0x${string}`,
  client: RelayerClient,
  onStep: (step: PasskeyRegistrationStep) => void = () => {},
): Promise<PasskeyRegistration> {
  assertWebAuthnSupported("create");
  const account = privateKeyToAccount(privateKey);

  onStep("authorizing");
  const authorization = (await readCaliburDelegation(account.address))
    ? undefined
    : await signCaliburAuthorization(account, client);

  onStep("creating-passkey");
  const credential = await createWebAuthnPasskey({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: RELYING_PARTY_ID, name: RELYING_PARTY_NAME },
      user: {
        id: new TextEncoder().encode(account.address),
        name: account.address,
        displayName: "CLC wallet",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      attestation: "none",
    },
  });
  const { x, y } = await extractP256Coords(credential.response as AuthenticatorAttestationResponse);

  onStep("registering");
  const [caliburNonceResponse, healthResponse] = await Promise.all([
    client.getCaliburNonce(account.address),
    client.getHealth(),
  ]);
  const relayerAddress = healthResponse.result.relayerAddress;
  if (!relayerAddress) {
    throw new Error("Relayer health response is missing relayerAddress");
  }

  const signedBatch = {
    batchedCall: {
      calls: [{ to: account.address, value: "0", data: encodeRegisterCalldata(x, y) }],
      revertOnFailure: true,
    },
    nonce: String(caliburNonceResponse.result.nonce),
    keyHash: ROOT_KEY_HASH,
    executor: relayerAddress as `0x${string}`,
    deadline: "0",
  };
  const digest = computeEIP712Digest(
    signedBatch,
    account.address,
    CALIBUR_ADDRESS,
    CHAIN_ID_BIGINT,
  );
  const rawSig = await account.sign({ hash: bytesToHex(digest) });

  const {
    result: { trackingId },
  } = await client.relay({
    userAddress: account.address,
    signedBatch,
    signature: encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [rawSig, "0x"]),
    signatureType: "secp256k1",
    authorization,
    credentialId: credential.id,
    publicKeyX: x.toString(),
    publicKeyY: y.toString(),
  });

  return {
    trackingId,
    credentialId: credential.id,
    keyHash: webAuthnKeyHash(x, y),
    publicKeyX: x.toString(),
    publicKeyY: y.toString(),
    address: account.address,
  };
}

async function signCaliburAuthorization(
  account: ReturnType<typeof privateKeyToAccount>,
  client: RelayerClient,
) {
  const {
    result: { nonce },
  } = await client.getEOANonce(account.address);
  const authSig = parseSignature(
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
    yParity: Number(authSig.yParity),
    r: authSig.r,
    s: authSig.s,
  };
}

async function extractP256Coords(
  response: AuthenticatorAttestationResponse,
): Promise<{ x: bigint; y: bigint }> {
  const spki = response.getPublicKey?.();
  if (!spki) throw new Error("Cannot extract P-256 key: getPublicKey() not available");
  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
  if (!jwk.x || !jwk.y) throw new Error("JWK missing x/y coordinates");
  return {
    x: BigInt(bytesToHex(base64UrlToBytes(jwk.x))),
    y: BigInt(bytesToHex(base64UrlToBytes(jwk.y))),
  };
}
