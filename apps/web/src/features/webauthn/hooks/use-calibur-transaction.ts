import {
  base64UrlToBytes,
  buildCaliburNonce,
  bytesToBase64Url,
  computeEIP712Digest,
  encodeWebAuthnAuth,
  normalizeS,
  parseDERSignature,
} from "@clc/core/features/webauthn/index";
import { encodeAbiParameters } from "viem";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { getWebAuthnCredential } from "#/lib/webauthn-storage";

const CALIBUR_ADDRESS = (import.meta.env.VITE_CALIBUR_ADDRESS ??
  "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85") as `0x${string}`;
const CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID ?? "42220");

export type CaliburCall = {
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function sendCaliburTransaction(
  calls: CaliburCall[],
  client: RelayerClient,
  deadlineSeconds = 600,
): Promise<{ txHash: string; trackingId: string }> {
  const cred = getWebAuthnCredential();
  if (!cred) throw new Error("No WebAuthn credential stored");
  if (cred.stale) throw new Error("Credential is stale; re-authenticate");

  const {
    result: { relayerAddress },
  } = await client.getHealth();
  const executor = relayerAddress as `0x${string}`;
  const {
    result: { nonce: seqStr },
  } = await client.getCaliburNonce(cred.address, cred.keyHash);

  const fullNonce = buildCaliburNonce(cred.keyHash, BigInt(seqStr));
  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;

  const signedBatch = {
    batchedCall: { calls, revertOnFailure: true },
    nonce: fullNonce.toString(),
    keyHash: cred.keyHash,
    executor,
    deadline: deadline.toString(),
  };

  const digestBytes = computeEIP712Digest(signedBatch, cred.address, CALIBUR_ADDRESS, CHAIN_ID);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(digestBytes),
      allowCredentials: [
        {
          id: toArrayBuffer(base64UrlToBytes(cred.credentialId)),
          type: "public-key",
        },
      ],
      userVerification: "required",
    },
  })) as PublicKeyCredential;

  if (!assertion) {
    throw new Error("WebAuthn assertion cancelled");
  }

  const response = assertion.response as AuthenticatorAssertionResponse;
  const derSig = new Uint8Array(response.signature);
  const { r, s } = parseDERSignature(derSig);
  const normalizedS = normalizeS(s);

  const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
  const typeIndex = clientDataJSON.indexOf('"type"');
  const challengeIndex = clientDataJSON.indexOf('"challenge"');
  if (typeIndex === -1 || challengeIndex === -1) throw new Error("Malformed clientDataJSON");

  const webAuthnSig = encodeWebAuthnAuth({
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON,
    challengeIndex: BigInt(challengeIndex),
    typeIndex: BigInt(typeIndex),
    r: BigInt(`0x${Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("")}`),
    s: BigInt("0x" + Array.from(normalizedS, (b) => b.toString(16).padStart(2, "0")).join("")),
  });

  const wrappedSig = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes" }],
    [webAuthnSig, "0x"],
  );

  const { result } = await client.relay({
    userAddress: cred.address,
    signedBatch,
    signature: wrappedSig,
    signatureType: "webauthn",
  });

  return result;
}

// Re-export for convenience
export { bytesToBase64Url };
