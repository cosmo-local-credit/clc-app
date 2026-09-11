import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";
import { createVoucherDeployClient } from "@clc/api/features/vouchers/deploy-client";
import { symbolKeys } from "@clc/api/features/symbols/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcHttp } from "#/lib/api/http";

const voucherDeployClient = createVoucherDeployClient(clcHttp);

export function useDeployVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VoucherDeployPayload) => voucherDeployClient.deployVoucher(payload),
    // The symbol just claimed is now occupied for the next form.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: symbolKeys.all }),
  });
}
