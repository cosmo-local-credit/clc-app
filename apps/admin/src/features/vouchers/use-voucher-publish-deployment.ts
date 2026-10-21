import { BackendApiError } from "@clc/api/client/errors";
import { TRACKING_POLL_MS } from "@clc/api/features/auth/client";
import { otxTrackQueryOptions } from "@clc/api/features/auth/otx-queries";
import {
  deploymentContractQueryOptions,
  deploymentKeys,
} from "@clc/api/features/deployments/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { getVoucherTrackingOutcome } from "@clc/api/features/vouchers/deploy-client";
import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clcApi } from "#/lib/api";

/** One stage per thing the operator is waiting on, in the order they resolve. */
type VoucherDeploymentStage = {
  label: string;
  state: "idle" | "active" | "done" | "failed";
  status: string;
};

function isNotFoundError(error: unknown): boolean {
  return error instanceof BackendApiError && error.kind === "not-found";
}

/**
 * Submit a voucher, then poll the same OTX track and contract endpoints the
 * member app uses, and open the new record once the catalog has its address.
 *
 * Two stages rather than the pool screen's five, because a token deploy is one
 * transaction: the deploy lands, then clc-core's indexer promotes it into the
 * catalog. Waiting for the second is what makes the redirect safe — the address
 * comes from the deployment record, and the detail screen it opens reads the
 * catalog, so navigating on the transaction alone would land on a row that does
 * not exist yet.
 */
export function useVoucherPublishDeployment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const deploy = useMutation({
    mutationFn: (payload: VoucherDeployPayload) => clcApi.voucherDeploy.deployVoucher(payload),
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
      // The relayer accepts before clc-core has an OTX row, so a 404 here is the
      // gap between the two rather than a missing deployment.
      if (isNotFoundError(currentQuery.state.error)) return TRACKING_POLL_MS;
      return getVoucherTrackingOutcome(currentQuery.state.data).kind === "pending"
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
    : getVoucherTrackingOutcome(tracking.data);

  const contract = useQuery({
    ...deploymentContractQueryOptions(
      clcApi.deployments,
      trackingId,
      "TOKEN",
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
          : "The voucher could not be published."
        : null;

  useEffect(() => {
    if (!errorMessage) return;
    toast.error(errorMessage);
  }, [errorMessage]);

  useEffect(() => {
    const address = contract.data?.address;
    if (!confirmed || !address) return;
    void queryClient.invalidateQueries({ queryKey: voucherKeys.all });
    toast.success("Voucher published.");
    void navigate({
      to: "/vouchers/$address",
      params: { address },
      search: { tab: "offerings" },
    });
  }, [confirmed, contract.data?.address, navigate, queryClient]);

  async function publish(payload: VoucherDeployPayload) {
    const result = await deploy.mutateAsync(payload);
    setTrackingId(result.trackingId);
    return result;
  }

  const deployed = outcome.kind === "success";
  const stages: VoucherDeploymentStage[] = [
    {
      label: "Voucher contract",
      state: deployed ? "done" : outcome.kind === "error" ? "failed" : "active",
      status: deployed ? "Confirmed" : outcome.kind === "error" ? "Failed" : "In network",
    },
    {
      label: "Catalog record",
      state: confirmed ? "done" : contractFailed ? "failed" : deployed ? "active" : "idle",
      status: confirmed
        ? "Confirmed"
        : contractFailed
          ? "Failed"
          : deployed
            ? "Indexing"
            : "Queued",
    },
  ];

  return {
    publish,
    publishing,
    started: deploy.isPending || trackingId !== null,
    errorMessage,
    stages,
  };
}
