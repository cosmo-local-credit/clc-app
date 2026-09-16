import { eip7702AuthMessage } from "@clc/core/features/webauthn/index";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import type { RelayerClient } from "@clc/api/features/relayer/client";
import { CHAIN_ID, CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";

export const DELEGATION_POLL_MS = 2_000;

export type DelegationStep = "idle" | "authorizing" | "confirming" | "done" | "error";

export function useCaliburDelegateFromPk(client: RelayerClient) {
  const [step, setStep] = useState<DelegationStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const tracking = useOtxTracking(trackingId, {
    pollMs: DELEGATION_POLL_MS,
    queryKey: "relayer-track",
    queryFn: async (nextTrackingId) => (await client.trackRelay(nextTrackingId)).result,
  });

  useEffect(() => {
    if (!trackingId) return;

    if (tracking.outcome.kind === "success") {
      setTrackingId(null);
      setStep("done");
      return;
    }

    if (tracking.outcome.kind === "error") {
      setTrackingId(null);
      setError(tracking.outcome.error);
      setStep("error");
    }
  }, [trackingId, tracking.outcome]);

  const mutation = useMutation({
    mutationFn: async ({ privateKey }: { privateKey: `0x${string}` }) => {
      setError(null);
      setTrackingId(null);
      setStep("authorizing");

      const account = privateKeyToAccount(privateKey);
      const {
        result: { nonce: nonceStr },
      } = await client.getEOANonce(account.address);
      const authMsg = eip7702AuthMessage({
        chainId: CHAIN_ID_BIGINT,
        contractAddress: CALIBUR_ADDRESS,
        nonce: BigInt(nonceStr),
      });
      const authSig = parseSignature(await account.sign({ hash: authMsg }));

      const result = await client.delegate({
        ephemeralAddress: account.address,
        authorization: {
          chainId: CHAIN_ID.toString(),
          contractAddress: CALIBUR_ADDRESS,
          nonce: String(nonceStr),
          yParity: Number(authSig.yParity),
          r: authSig.r,
          s: authSig.s,
        },
      });

      setTrackingId(result.result.trackingId);
      setStep("confirming");
      return result;
    },
    onError: (err) => {
      setTrackingId(null);
      setError(err instanceof Error ? err.message : "Smart wallet activation failed.");
      setStep("error");
    },
  });

  return {
    ...mutation,
    step,
    error,
    isPending: mutation.isPending || step === "confirming",
  };
}
