import { useMutation, useQuery } from "@tanstack/react-query";

import {
  deployVoucher,
  getVoucherDeploymentContract,
  getVoucherTags,
} from "#/features/vouchers/api/voucher-deploy-client";

const DEPLOYMENT_POLL_MS = 2_000;

export const voucherDeploymentQueryKeys = {
  all: ["voucher-deployments"] as const,
  tags: () => [...voucherDeploymentQueryKeys.all, "tags"] as const,
  contract: (trackingId: string | null) =>
    [...voucherDeploymentQueryKeys.all, "contract", trackingId ?? "none"] as const,
};

export function useVoucherTags(enabled = true) {
  return useQuery({
    queryKey: voucherDeploymentQueryKeys.tags(),
    queryFn: ({ signal }) => getVoucherTags(signal),
    enabled,
    staleTime: 30 * 60_000,
  });
}

export function useDeployVoucher() {
  return useMutation({ mutationFn: deployVoucher });
}

export function useVoucherDeploymentContract(trackingId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: voucherDeploymentQueryKeys.contract(trackingId),
    queryFn: ({ signal }) => getVoucherDeploymentContract(trackingId!, signal),
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
