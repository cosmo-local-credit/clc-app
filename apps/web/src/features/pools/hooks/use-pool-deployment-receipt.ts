import {
  getPoolDeploymentRecords,
  getPoolTrackingOutcome,
} from "@clc/api/features/pools/deploy-client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { getPoolDeploymentStages } from "@clc/core/features/pools/logic";
import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useDeploymentContract } from "#/hooks/use-deployment";
import { exitPoolCreateHistory } from "#/lib/navigation/pool-create-history";

/**
 * Tracks a pool deployment to its outcome: the five contract stages, the
 * deployed contract, and the draft that was sent. Shared by the phone receipt
 * and the desktop publishing screen.
 */
export function usePoolDeploymentReceipt(trackingId: string | undefined) {
  const { t } = useLingui();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearDraft = usePoolCreateDraft((state) => state.clearDraft);
  const draft = usePoolCreateDraft((state) => state.draft);
  const draftPricing = draft?.pricing;
  const tracking = useOtxTracking(trackingId ?? null, {
    queryKey: "pool-deploy-track",
    getOutcome: getPoolTrackingOutcome,
  });
  const records = getPoolDeploymentRecords(tracking.data);
  const stages = getPoolDeploymentStages(
    records,
    {
      registry: t`Voucher registry`,
      limits: t`Limits`,
      feePolicy: t`Fee policy`,
      pricing: t`Pricing`,
      pool: t`The pool`,
    },
    {
      confirmed: t`Confirmed`,
      inNetwork: t`In network`,
      failed: t`Failed`,
      reverted: t`Reverted`,
      queued: t`Queued`,
      notSent: t`Not sent`,
    },
    draftPricing,
  );
  const completedCount = stages.filter((stage) => stage.state === "done").length;
  const failedStage = stages.find((stage) => stage.state === "failed");
  const contractQuery = useDeploymentContract(
    trackingId ?? null,
    "POOL",
    tracking.outcome.kind === "success",
  );
  const contract = contractQuery.data;
  const confirmed = contract?.status === "CONFIRMED" && contract.address !== null;

  useEffect(() => {
    if (!confirmed) return;
    void queryClient.invalidateQueries({ queryKey: poolKeys.all });
  }, [confirmed, queryClient]);

  const exit = (destination: string, preserveDraft = false) => {
    if (!preserveDraft) clearDraft();
    exitPoolCreateHistory({ history: router.history, destination });
  };

  const failed =
    tracking.outcome.kind === "error" || contractQuery.isError || contract?.status === "FAILED";
  const failureMessage = failedStage
    ? t`${failedStage.label} failed on-chain. The pool was not created.`
    : tracking.outcome.kind === "error"
      ? tracking.outcome.error
      : contractQuery.error instanceof Error
        ? contractQuery.error.message
        : t`The pool could not be published.`;
  const txHash = tracking.outcome.kind === "success" ? tracking.outcome.otx.txHash : "";

  const copyValue = (value: string, successMessage: string, errorMessage: string) => {
    if (!navigator.clipboard) {
      toast.error(errorMessage);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(successMessage))
      .catch(() => toast.error(errorMessage));
  };

  return {
    draft,
    stages,
    completedCount,
    contract,
    confirmed,
    failed,
    failureMessage,
    txHash,
    exit,
    copyValue,
  };
}
