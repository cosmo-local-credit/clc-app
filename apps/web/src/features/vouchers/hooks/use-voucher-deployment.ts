import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";
import { createVoucherDeployClient } from "@clc/api/features/vouchers/deploy-client";
import { useMutation } from "@tanstack/react-query";

import { clcHttp } from "#/lib/api/http";

const voucherDeployClient = createVoucherDeployClient(clcHttp);

export function useDeployVoucher() {
  return useMutation({
    mutationFn: (payload: VoucherDeployPayload) => voucherDeployClient.deployVoucher(payload),
  });
}
