import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { RelayerClient } from "@clc/api/features/relayer/client";
import { collectWebAuthnAssertion } from "#/features/webauthn/hooks/assertion";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";
import { authClient } from "#/lib/api/auth";

export type SigninStep = "idle" | "asserting" | "verifying" | "done" | "error";

// Passkey sign-in: prompt the authenticator, then have the backend verify the
// assertion and issue the session cookie. Unlike paper-wallet / private-key
// sign-in there is no SIWE step — the assertion authenticates the user. The
// mutation surfaces BackendApiError (404 not registered, 403 pending/rejected,
// 401 assertion rejected) so callers can branch on it.
export function useCaliburSignin(client: RelayerClient) {
  const [step, setStep] = useState<SigninStep>("idle");

  const signin = useMutation({
    mutationFn: async () => {
      setStep("asserting");
      const assertion = await collectWebAuthnAssertion(client);

      setStep("verifying");
      const result = await authClient.signinWithWebAuthn(assertion);

      storeWebAuthnCredential({
        credentialId: assertion.credentialId,
        keyHash: result.keyHash as `0x${string}`,
        publicKeyX: result.publicKeyX,
        publicKeyY: result.publicKeyY,
        address: result.address as `0x${string}`,
      });

      setStep("done");
      return result;
    },
    onError: () => setStep("error"),
  });

  return { step, signin };
}
