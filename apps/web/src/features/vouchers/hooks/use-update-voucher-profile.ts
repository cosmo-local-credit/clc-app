import type { MarketVoucherDetail, VoucherProfileUpdate } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { wantKeys } from "@clc/api/features/wants/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { marketClient } from "#/lib/api/market";
import { tokenTagsQueryKey } from "#/hooks/use-deployment";

/**
 * The owner's write to their voucher's catalog record.
 *
 * The PUT answers with the saved row, but the detail this screen reads is the
 * public GET, which the browser caches for a minute and serves stale for five
 * more. Seeding the query from the PUT and then invalidating would refetch
 * that GET from the HTTP cache and put the pre-write body straight back on
 * screen. So the row is read back with `cache: "reload"`, which bypasses the
 * browser's copy and replaces it, and that read seeds the detail query. The
 * detail is then left out of the invalidation, because a refetch could only
 * hand back what was just written. The rest of the voucher keys are
 * invalidated because a renamed, re-tagged or relocated voucher reads
 * differently in the market list, the viewport reads and the facets.
 */
export function useUpdateVoucherProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: VoucherProfileUpdate) => {
      await marketClient.updateVoucherProfile(address, profile);
      return marketClient.getMarketVoucher(address, undefined, { cache: "reload" });
    },
    onSuccess: (voucher: MarketVoucherDetail) => {
      queryClient.setQueryData(voucherKeys.detail(address), voucher);
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: voucherKeys.all,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
      ]);
    },
  });
}
