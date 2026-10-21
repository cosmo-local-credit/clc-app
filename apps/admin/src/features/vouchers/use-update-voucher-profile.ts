import type { MarketVoucherDetail, VoucherProfileUpdate } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { deploymentKeys } from "@clc/api/features/deployments/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * Saves an operator's edits to a voucher's catalog record.
 *
 * A write to the catalog rather than to the chain, so unlike a deploy there is no
 * indexer to wait for: the response carries the saved row and the cache can take
 * it directly. The detail query is seeded with it so the screen shows the saved
 * record without a refetch and left out of invalidation so no follow-up read can
 * replace the authoritative result. The rest of the voucher keys are invalidated
 * because a re-tagged or relocated voucher reads differently in the market list,
 * the viewport reads and the facets.
 */
export function useUpdateVoucherProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: VoucherProfileUpdate) =>
      clcApi.admin.updateVoucherProfile(address, profile),
    onSuccess: (voucher: MarketVoucherDetail) => {
      queryClient.setQueryData(voucherKeys.detail(address), voucher);
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: voucherKeys.all,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: deploymentKeys.tokenTags() }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
      ]);
    },
  });
}
