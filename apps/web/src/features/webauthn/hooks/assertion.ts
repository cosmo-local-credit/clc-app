import { base64UrlToBytes, bytesToBase64Url } from "@clc/core/features/webauthn/index";

import type { WebAuthnAssertionPayload } from "@clc/api/features/auth/client";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { requestWebAuthnAssertion } from "#/features/webauthn/hooks/credential";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";

const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Fetches a one-time challenge from the relayer, prompts the platform
// authenticator, and returns the assertion encoded for the backend verify /
// recover endpoints. Shared by the passkey sign-in and wallet-recovery flows.
export async function collectWebAuthnAssertion(
  client: RelayerClient,
): Promise<WebAuthnAssertionPayload> {
  const {
    result: { challenge: challengeB64 },
  } = await client.getWebAuthnChallenge();
  const challengeBytes = base64UrlToBytes(challengeB64);

  const assertion = await requestWebAuthnAssertion({
    publicKey: {
      challenge: toArrayBuffer(challengeBytes),
      rpId: RELYING_PARTY_ID,
      userVerification: "required",
    },
  });

  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    credentialId: assertion.id,
    authenticatorData: bytesToBase64Url(response.authenticatorData),
    clientDataJSON: bytesToBase64Url(response.clientDataJSON),
    signature: bytesToBase64Url(response.signature),
  };
}
