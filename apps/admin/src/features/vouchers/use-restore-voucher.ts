import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { adminKeys } from "@clc/api/features/admin/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * Returns a retired voucher to the public catalog.
 *
 * Superadmin-only in clc-core, and there is no owner-facing counterpart: an
 * owner may retire their own voucher but not put it back, so this button is the
 * whole restore path.
 *
 * The response is the restored row, so the console's detail entry is seeded from
 * it rather than refetched. Both key spaces are then invalidated: the admin
 * pages because the row moved between the status segments, and the public
 * voucher keys because the voucher is now visible to apps/web again and any
 * cached market list here predates that.
 */
export function useRestoreVoucher(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clcApi.admin.restoreVoucher(address),
    onSuccess: (voucher: MarketVoucherDetail) => {
      queryClient.setQueryData(adminKeys.voucher(address), voucher);
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.all,
          predicate: (query) => query.queryKey[3] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: voucherKeys.all }),
      ]);
    },
  });
}
