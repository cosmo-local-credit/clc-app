import type { MarketVoucherDetail, VoucherProfileUpdate } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { marketClient } from "#/lib/api/market";

// The response is authoritative and immediate, unlike a public catalog refetch
// that may still be served from its cache after the write lands. The rest of
// the voucher keys are invalidated because a re-tagged or relocated voucher
// reads differently in the market list, the viewport reads and the facets.
export function useUpdateVoucherProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: VoucherProfileUpdate) =>
      marketClient.updateVoucherProfile(address, profile),
    onSuccess: (voucher: MarketVoucherDetail) => {
      queryClient.setQueryData(voucherKeys.detail(address), voucher);
      return queryClient.invalidateQueries({ queryKey: voucherKeys.all });
    },
  });
}
