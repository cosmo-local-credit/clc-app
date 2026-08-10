import { useMutation } from "@tanstack/react-query";

import { deployVoucher } from "#/features/vouchers/api/voucher-deploy-client";

export function useDeployVoucher() {
  return useMutation({ mutationFn: deployVoucher });
}
