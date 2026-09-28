import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { RelayerClient } from "@clc/api/features/relayer/client";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import {
  type PasskeyRegistration,
  registerPasskey,
} from "#/features/webauthn/api/register-passkey";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";

export type UpgradeStep =
  | "idle"
  | "authorizing"
  | "creating-passkey"
  | "registering"
  | "confirming"
  | "done"
  | "error";

/**
 * Links a platform passkey to the paper wallet onboarding just generated.
 *
 * `upgradeAndLink` runs the shared `registerPasskey` operation — EIP-7702
 * delegation when the wallet needs it, plus the Calibur `register` call — and
 * follows the relay to on-chain confirmation before storing the credential.
 * After success the caller should connect with `caliburConnector`.
 */
export function useCaliburFromPk(pk: `0x${string}`, client: RelayerClient) {
  const [step, setStep] = useState<UpgradeStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingUpgrade, setPendingUpgrade] = useState<PasskeyRegistration | null>(null);
  const tracking = useOtxTracking(pendingUpgrade?.trackingId ?? null, {
    queryKey: "relayer-track",
    queryFn: async (trackingId) => (await client.trackRelay(trackingId)).result,
  });

  useEffect(() => {
    if (!pendingUpgrade) return;

    if (tracking.outcome.kind === "success") {
      storeWebAuthnCredential({
        credentialId: pendingUpgrade.credentialId,
        keyHash: pendingUpgrade.keyHash,
        publicKeyX: pendingUpgrade.publicKeyX,
        publicKeyY: pendingUpgrade.publicKeyY,
        address: pendingUpgrade.address,
      });
      setPendingUpgrade(null);
      setStep("done");
      return;
    }

    if (tracking.outcome.kind === "error") {
      setPendingUpgrade(null);
      setError(tracking.outcome.error);
      setStep("error");
    }
  }, [pendingUpgrade, tracking.outcome]);

  const upgradeAndLink = useMutation({
    mutationFn: async () => {
      setError(null);
      setPendingUpgrade(null);
      const registration = await registerPasskey(pk, client, setStep);
      setPendingUpgrade(registration);
      setStep("confirming");
    },
    onError: (err) => {
      setPendingUpgrade(null);
      setError(err instanceof Error ? err.message : "Upgrade failed");
      setStep("error");
    },
  });

  return { step, error, upgradeAndLink };
}
