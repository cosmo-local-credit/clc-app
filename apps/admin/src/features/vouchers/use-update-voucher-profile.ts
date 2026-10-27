import type { MarketVoucherDetail, VoucherProfileUpdate } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { adminKeys } from "@clc/api/features/admin/queries";
import { deploymentKeys } from "@clc/api/features/deployments/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * Saves an operator's edits to a voucher's catalog record.
 *
 * A write to the catalog rather than to the chain, so unlike a deploy there is no
 * indexer to wait for: the response carries the saved row and the cache can take
 * it directly. The protected row seeds only the admin detail key; public voucher
 * caches are invalidated and must refresh through their redacted endpoint.
 */
export function useUpdateVoucherProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: VoucherProfileUpdate) =>
      clcApi.admin.updateVoucherProfile(address, profile),
    onSuccess: (voucher: MarketVoucherDetail) => {
      queryClient.setQueryData(adminKeys.voucher(address), voucher);
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: voucherKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: adminKeys.all,
          predicate: (query) => query.queryKey[3] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: deploymentKeys.tokenTags() }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
      ]);
    },
  });
}
