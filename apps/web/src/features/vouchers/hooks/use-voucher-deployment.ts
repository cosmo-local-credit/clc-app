import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";
import { useMutation } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";

export function useDeployVoucher() {
  return useMutation({
    mutationFn: (payload: VoucherDeployPayload) => clcApi.voucherDeploy.deployVoucher(payload),
  });
}
