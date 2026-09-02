import {
  base64UrlToBytes,
  eip7702AuthMessage,
  encodeWebAuthnAuth,
  normalizeS,
  parseDERSignature,
  type CaliburCall,
} from "@clc/core/features/webauthn/index";
import { encodeAbiParameters, hexToBytes, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getStoredKey } from "#/connectors/privateKey";
import { requestWebAuthnAssertion } from "#/features/webauthn/hooks/credential";
import { CHAIN_ID, CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";
import { getWebAuthnCredential } from "#/lib/webauthn-storage";
import type { RelayerClient } from "@clc/api/features/relayer/client";

const ZERO_HASH = `0x${"00".repeat(32)}` as `0x${string}`;

export type RelayCaliburBatchInput = {
  senderAddress: `0x${string}`;
  calls: CaliburCall[];
  includeAuthorization?: boolean;
  deadline?: string;
};

export type RelayCaliburBatchResult = {
  trackingId: string;
  signatureType: "secp256k1" | "webauthn";
};

export async function relayCaliburBatch(
  input: RelayCaliburBatchInput,
  client: RelayerClient,
): Promise<RelayCaliburBatchResult> {
  const batchedCall = { calls: input.calls, revertOnFailure: true };
  const {
    result: { relayerAddress },
  } = await client.getHealth();
  if (!relayerAddress) throw new Error("Relayer health response is missing relayerAddress");
  const executor = relayerAddress as `0x${string}`;
  const deadline = input.deadline ?? "0";

  const credential = getWebAuthnCredential();
  if (credential) {
    if (credential.stale) throw new Error("Credential is stale; re-authenticate");
    if (credential.address.toLowerCase() !== input.senderAddress.toLowerCase()) {
      throw new Error("Stored passkey does not match the connected wallet.");
    }

    const preview = await client.relayPreview({
      userAddress: credential.address,
      batchedCall,
      keyHash: credential.keyHash,
      executor,
      deadline,
    });
    const signedBatch = {
      batchedCall,
      nonce: preview.result.nonce,
      keyHash: credential.keyHash,
      executor,
      deadline,
    };
    const signature = await signPreviewWithWebAuthn(preview.result.digest, credential.credentialId);
    const { result } = await client.relay({
      userAddress: credential.address,
      signedBatch,
      signature,
      signatureType: "webauthn",
      authorization: undefined,
    });
    return { trackingId: result.trackingId, signatureType: "webauthn" };
  }

  const privateKey = getStoredKey();
  if (!privateKey) throw new Error("No signing key found for this wallet.");
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== input.senderAddress.toLowerCase()) {
    throw new Error("Stored private key does not match the connected wallet.");
  }

  const preview = await client.relayPreview({
    userAddress: account.address,
    batchedCall,
    keyHash: ZERO_HASH,
    executor,
    deadline,
  });
  const signedBatch = {
    batchedCall,
    nonce: preview.result.nonce,
    keyHash: ZERO_HASH,
    executor,
    deadline,
  };
  const rawSig = await account.sign({ hash: preview.result.digest });
  const signature = encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [rawSig, "0x"]);
  const authorization = input.includeAuthorization
    ? await buildAuthorization(account, client)
    : undefined;

  const { result } = await client.relay({
    userAddress: account.address,
    signedBatch,
    signature,
    signatureType: "secp256k1",
    authorization,
  });
  return { trackingId: result.trackingId, signatureType: "secp256k1" };
}

async function buildAuthorization(
  account: ReturnType<typeof privateKeyToAccount>,
  client: RelayerClient,
) {
  const {
    result: { nonce: eoaNonce },
  } = await client.getEOANonce(account.address);
  const authMsg = eip7702AuthMessage({
    chainId: CHAIN_ID_BIGINT,
    contractAddress: CALIBUR_ADDRESS,
    nonce: BigInt(eoaNonce),
  });
  const authSig = parseSignature(await account.sign({ hash: authMsg }));
  return {
    chainId: CHAIN_ID.toString(),
    contractAddress: CALIBUR_ADDRESS,
    nonce: String(eoaNonce),
    yParity: Number(authSig.yParity),
    r: authSig.r,
    s: authSig.s,
  };
}

async function signPreviewWithWebAuthn(
  digest: `0x${string}`,
  credentialId: string,
): Promise<`0x${string}`> {
  const assertion = await requestWebAuthnAssertion({
    publicKey: {
      challenge: toArrayBuffer(hexToBytes(digest)),
      allowCredentials: [
        {
          id: toArrayBuffer(base64UrlToBytes(credentialId)),
          type: "public-key",
        },
      ],
      userVerification: "required",
    },
  });

  const response = assertion.response as AuthenticatorAssertionResponse;
  const { r, s } = parseDERSignature(new Uint8Array(response.signature));
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
    r: bytesToBigInt(r),
    s: bytesToBigInt(normalizedS),
  });

  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [webAuthnSig, "0x"]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}
