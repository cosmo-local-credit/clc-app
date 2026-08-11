import { useQuery } from "@tanstack/react-query";

import {
  getDeploymentContract,
  getTokenTags,
  type DeploymentContractType,
} from "#/lib/deployment-client";

const DEPLOYMENT_POLL_MS = 2_000;

const deploymentQueryKeys = {
  all: ["deployments"] as const,
  tags: () => [...deploymentQueryKeys.all, "token-tags"] as const,
  contract: (type: DeploymentContractType, trackingId: string | null) =>
    [...deploymentQueryKeys.all, "contract", type, trackingId ?? "none"] as const,
};

export function useTokenTags() {
  return useQuery({
    queryKey: deploymentQueryKeys.tags(),
    queryFn: ({ signal }) => getTokenTags(signal),
    staleTime: 30 * 60_000,
  });
}

export function useDeploymentContract(
  trackingId: string | null,
  expectedType: DeploymentContractType,
  enabled: boolean,
) {
  return useQuery({
    queryKey: deploymentQueryKeys.contract(expectedType, trackingId),
    queryFn: ({ signal }) => getDeploymentContract(trackingId!, expectedType, signal),
    enabled: Boolean(trackingId) && enabled,
    retry: false,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const contract = query.state.data;
      if (contract?.status === "FAILED") return false;
      return contract?.address && contract.status === "CONFIRMED" ? false : DEPLOYMENT_POLL_MS;
    },
  });
}
