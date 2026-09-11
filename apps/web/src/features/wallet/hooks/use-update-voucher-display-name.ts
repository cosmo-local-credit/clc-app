import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { marketClient } from "#/lib/api/market";

// The response is authoritative and immediate, unlike a public catalog refetch
// that may still be served from its cache after the write lands.
export function useUpdateVoucherDisplayName(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (displayName: string) =>
      marketClient.updateVoucherDisplayName(address, displayName),
    onSuccess: (voucher: MarketVoucherDetail) => {
      queryClient.setQueryData(voucherKeys.detail(address), voucher);
      return queryClient.invalidateQueries({ queryKey: voucherKeys.all });
    },
  });
}
