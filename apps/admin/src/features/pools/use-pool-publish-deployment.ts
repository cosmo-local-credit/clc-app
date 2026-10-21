import { BackendApiError } from "@clc/api/client/errors";
import { TRACKING_POLL_MS } from "@clc/api/features/auth/client";
import { otxTrackQueryOptions } from "@clc/api/features/auth/otx-queries";
import {
  deploymentContractQueryOptions,
  deploymentKeys,
} from "@clc/api/features/deployments/queries";
import {
  getPoolDeploymentRecords,
  getPoolTrackingOutcome,
} from "@clc/api/features/pools/deploy-client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import type { PoolDeployPayload, PoolPricing } from "@clc/core/features/pools/logic";
import { getPoolDeploymentStages } from "@clc/core/features/pools/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clcApi } from "#/lib/api";

const STAGE_LABELS = {
  registry: "Voucher registry",
  limits: "Limits",
  feePolicy: "Fee policy",
  pricing: "Pricing",
  pool: "Pool",
} as const;

const STAGE_STATUS = {
  confirmed: "Confirmed",
  inNetwork: "In network",
  failed: "Failed",
  reverted: "Reverted",
  queued: "Queued",
  notSent: "Not sent",
} as const;

function isNotFoundError(error: unknown): boolean {
  return error instanceof BackendApiError && error.kind === "not-found";
}

/**
 * Submit a pool, then poll the same OTX track + contract endpoints the
 * member app uses, and open the new record when the proxy is confirmed.
 */
export function usePoolPublishDeployment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PoolPricing>("relative");

  const deploy = useMutation({
    mutationFn: (payload: PoolDeployPayload) => clcApi.poolDeploy.deployPool(payload),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: deploymentKeys.tokenTags() }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
      ]),
  });

  const tracking = useQuery({
    ...otxTrackQueryOptions(clcApi.auth, trackingId),
    refetchIntervalInBackground: true,
    refetchInterval: (currentQuery) => {
      if (!trackingId) return false;
      if (isNotFoundError(currentQuery.state.error)) return TRACKING_POLL_MS;
      return getPoolTrackingOutcome(currentQuery.state.data).kind === "pending"
        ? TRACKING_POLL_MS
        : false;
    },
  });

  const outcome = tracking.isError
    ? isNotFoundError(tracking.error)
      ? { kind: "pending" as const }
      : {
          kind: "error" as const,
          error: tracking.error instanceof Error ? tracking.error.message : "Tracking failed.",
        }
    : getPoolTrackingOutcome(tracking.data);

  const contract = useQuery({
    ...deploymentContractQueryOptions(
      clcApi.deployments,
      trackingId,
      "POOL",
      outcome.kind === "success",
    ),
    refetchIntervalInBackground: true,
    refetchInterval: (currentQuery) => {
      if (isNotFoundError(currentQuery.state.error)) return TRACKING_POLL_MS;
      const next = currentQuery.state.data;
      if (next?.status === "FAILED") return false;
      return next?.address && next.status === "CONFIRMED" ? false : TRACKING_POLL_MS;
    },
  });

  const contractFailed =
    contract.data?.status === "FAILED" || (contract.isError && !isNotFoundError(contract.error));
  const confirmed = contract.data?.status === "CONFIRMED" && contract.data.address !== null;
  const publishing =
    deploy.isPending ||
    (trackingId !== null && !confirmed && outcome.kind !== "error" && !contractFailed);

  const errorMessage =
    outcome.kind === "error"
      ? outcome.error
      : contractFailed
        ? contract.error instanceof Error
          ? contract.error.message
          : "The pool could not be published."
        : null;

  useEffect(() => {
    if (!errorMessage) return;
    toast.error(errorMessage);
  }, [errorMessage]);

  useEffect(() => {
    const address = contract.data?.address;
    if (!confirmed || !address) return;
    void queryClient.invalidateQueries({ queryKey: poolKeys.all });
    toast.success("Pool published.");
    void navigate({
      to: "/pools/$address",
      params: { address },
      search: { tab: "vouchers" },
    });
  }, [confirmed, contract.data?.address, navigate, queryClient]);

  async function publish(payload: PoolDeployPayload) {
    setPricing(payload.quoterType);
    const result = await deploy.mutateAsync(payload);
    setTrackingId(result.trackingId);
    return result;
  }

  return {
    publish,
    publishing,
    started: deploy.isPending || trackingId !== null,
    errorMessage,
    stages: getPoolDeploymentStages(
      getPoolDeploymentRecords(tracking.data),
      STAGE_LABELS,
      STAGE_STATUS,
      pricing,
    ),
  };
}
