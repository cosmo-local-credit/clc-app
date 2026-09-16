/**
 * Collects a WebAuthn assertion for operator sign-in.
 *
 * Everything shareable is shared: the challenge comes from
 * @clc/api/features/relayer/client, the encoding and the relying-party rule come
 * from @clc/core, and the payload shape is the one
 * @clc/api/features/auth/client posts. What is left is the `navigator.credentials`
 * call itself — a browser capability an app owns, which is why it is not in a
 * package.
 *
 * apps/web wraps the same call in a retry for Android's Credential Manager, which
 * fails the first request after a cold start. This console is desktop-only, so
 * that retry is deliberately absent rather than copied.
 *
 * Two environment constraints, both enforced by clc-core rather than here:
 * the credential is bound to the relying-party ID it was registered under, so the
 * console must be reached at that host; and the browser-reported origin must be
 * listed in `relayer.allowed_origins`, or verification fails with "origin not
 * allowed" (internal/relayer/webauthn.go).
 */

import { base64UrlToBytes, bytesToBase64Url } from "@clc/core/features/webauthn/index";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";

import type { WebAuthnAssertionPayload } from "@clc/api/features/auth/client";
import { relayerClient } from "#/lib/relayer-config";

const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);

export async function collectAdminAssertion(): Promise<WebAuthnAssertionPayload> {
  const {
    result: { challenge },
  } = await relayerClient.getWebAuthnChallenge();

  const challengeBytes = base64UrlToBytes(challenge);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes.buffer.slice(
        challengeBytes.byteOffset,
        challengeBytes.byteOffset + challengeBytes.byteLength,
      ) as ArrayBuffer,
      rpId: RELYING_PARTY_ID,
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Passkey prompt was dismissed.");

  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    credentialId: assertion.id,
    authenticatorData: bytesToBase64Url(response.authenticatorData),
    clientDataJSON: bytesToBase64Url(response.clientDataJSON),
    signature: bytesToBase64Url(response.signature),
  };
}
