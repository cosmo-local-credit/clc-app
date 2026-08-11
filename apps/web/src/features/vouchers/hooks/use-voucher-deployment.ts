import { useMutation } from "@tanstack/react-query";

import { deployVoucher } from "@clc/api/features/vouchers/deploy-client";

export function useDeployVoucher() {
  return useMutation({ mutationFn: deployVoucher });
}
