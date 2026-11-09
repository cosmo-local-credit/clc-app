import { resourceLimitKeys } from "@clc/api/features/resource-limits/queries";
import type { VoucherDeployPayload } from "@clc/core/features/vouchers/logic";
import { createVoucherDeployClient } from "@clc/api/features/vouchers/deploy-client";
import { nameKeys } from "@clc/api/features/names/queries";
import { symbolKeys } from "@clc/api/features/symbols/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { wantKeys } from "@clc/api/features/wants/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcHttp } from "#/lib/api/http";
import { tokenTagsQueryKey } from "#/hooks/use-deployment";

const voucherDeployClient = createVoucherDeployClient(clcHttp);

/**
 * Names every voucher publish, so a view that mounts while one is still in
 * flight (the phone/desktop swap) can see it and hold its own Publish.
 */
export const deployVoucherMutationKey = ["vouchers", "deploy"] as const;

export function useDeployVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: deployVoucherMutationKey,
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
    mutationFn: (payload: VoucherDeployPayload) => voucherDeployClient.deployVoucher(payload),
    // The symbol and name just claimed are now occupied for the next form.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: symbolKeys.all }),
        queryClient.invalidateQueries({ queryKey: nameKeys.all }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
      ]),
  });
}
