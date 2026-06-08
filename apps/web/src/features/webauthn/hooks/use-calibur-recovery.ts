import { base64UrlToBytes, bytesToBase64Url } from "@clc/core/features/webauthn/index";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { RelayerError } from "#/features/webauthn/api/relayer-client";
import { resolveRelyingPartyId } from "#/features/webauthn/hooks/rp-id";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";

export type RecoveryStep = "idle" | "challenging" | "asserting" | "verifying" | "done" | "error";
export type RecoveryOutcome = "recovered" | "not_found" | "failed";

const RELYING_PARTY_ID = resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID);

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function useCaliburRecovery(client: RelayerClient) {
  const [step, setStep] = useState<RecoveryStep>("idle");
  const [outcome, setOutcome] = useState<RecoveryOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recover = useMutation({
    mutationFn: async () => {
      setError(null);
      setOutcome(null);

      setStep("challenging");
      const {
        result: { challenge: challengeB64 },
      } = await client.getWebAuthnChallenge();
      const challengeBytes = base64UrlToBytes(challengeB64);

      setStep("asserting");
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: toArrayBuffer(challengeBytes),
          rpId: RELYING_PARTY_ID,
          userVerification: "required",
        },
      })) as PublicKeyCredential;

      if (!assertion) throw new Error("WebAuthn assertion cancelled");

      const response = assertion.response as AuthenticatorAssertionResponse;

      setStep("verifying");
      const { result } = await client.recoverWebAuthn({
        credentialId: assertion.id,
        authenticatorData: bytesToBase64Url(response.authenticatorData),
        clientDataJSON: bytesToBase64Url(response.clientDataJSON),
        signature: bytesToBase64Url(response.signature),
      });

      storeWebAuthnCredential({
        credentialId: assertion.id,
        keyHash: result.keyHash as `0x${string}`,
        publicKeyX: result.publicKeyX,
        publicKeyY: result.publicKeyY,
        address: result.address as `0x${string}`,
      });

      setOutcome("recovered");
      setStep("done");
      return result;
    },
    onError: (err) => {
      if (err instanceof RelayerError) {
        if (err.code === "not_found") {
          setOutcome("not_found");
        } else {
          setOutcome("failed");
          setError(err.description);
        }
      } else {
        setOutcome("failed");
        setError(err instanceof Error ? err.message : "Recovery failed");
      }
      setStep("error");
    },
  });

  return { step, outcome, error, recover };
}
