import {
  base64UrlToBytes,
  encodeWebAuthnAuth,
  normalizeS,
  parseDERSignature,
} from "@clc/core/features/webauthn/index";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";
import { hexToBytes } from "viem";

import { requestWebAuthnAssertion } from "#/features/webauthn/hooks/credential";

const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);

/**
 * Signs a 32-byte digest with the stored passkey and returns the assertion in
 * Calibur's `WebAuthnAuth` encoding. The challenge is the digest itself, which
 * is what Calibur's WebAuthn key check reconstructs. Callers wrap the result
 * for their entrypoint: a relayed batch or `isValidSignature`.
 */
export async function signDigestWithPasskey(
  digest: `0x${string}`,
  credentialId: string,
): Promise<`0x${string}`> {
  const assertion = await requestWebAuthnAssertion({
    publicKey: {
      challenge: toArrayBuffer(hexToBytes(digest)),
      rpId: RELYING_PARTY_ID,
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

  return encodeWebAuthnAuth({
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON,
    challengeIndex: BigInt(challengeIndex),
    typeIndex: BigInt(typeIndex),
    r: bytesToBigInt(r),
    s: bytesToBigInt(normalizedS),
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}
