import { queryOptions } from "@tanstack/react-query";
import type { DeploymentContractType, DeploymentsClient } from "./client";

/** Data used by both creation flows. Tags change rarely, but never belong in a UI store. */
export const deploymentKeys = {
  all: ["clc", "deployments"] as const,
  tokenTags: () => ["clc", "deployments", "token-tags"] as const,
  contract: (type: DeploymentContractType, trackingId: string | null) =>
    ["clc", "deployments", "contract", type, trackingId ?? "none"] as const,
} as const;

export function tokenTagsQueryOptions(deployments: DeploymentsClient) {
  return queryOptions({
    queryKey: deploymentKeys.tokenTags(),
    queryFn: ({ signal }) => deployments.getTokenTags(signal),
    staleTime: 5 * 60_000,
  });
}

/** The catalog record for a just-deployed pool or voucher, once OTX has a success. */
export function deploymentContractQueryOptions(
  deployments: DeploymentsClient,
  trackingId: string | null,
  expectedType: DeploymentContractType,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: deploymentKeys.contract(expectedType, trackingId),
    queryFn: ({ signal }) => deployments.getDeploymentContract(trackingId!, expectedType, signal),
    enabled: Boolean(trackingId) && enabled,
    retry: false,
    staleTime: 0,
  });
}
