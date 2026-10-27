import type { MarketVoucherDetail, VoucherProfileUpdate } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { wantKeys } from "@clc/api/features/wants/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { marketClient } from "#/lib/api/market";
import { tokenTagsQueryKey } from "#/hooks/use-deployment";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

/**
 * The owner's write to their voucher's catalog record.
 *
 * The mutation result may contain protected contact metadata, so it must never
 * seed the public detail cache. Read the complete row back through the private
 * endpoint and seed only the wallet-scoped info key. Public detail, lists,
 * viewport reads and facets are invalidated independently; the fresh private
 * row stays authoritative while those public projections refresh.
 */
export function useUpdateVoucherProfile(address: string) {
  const queryClient = useQueryClient();
  const auth = useAuthStatus();
  const viewer = auth.isAuthenticated ? auth.session?.address : undefined;

  return useMutation({
    mutationFn: async (profile: VoucherProfileUpdate) => {
      await marketClient.updateVoucherProfile(address, profile);
      return marketClient.getVoucherInfo(address);
    },
    onSuccess: (voucher: MarketVoucherDetail) => {
      if (viewer) queryClient.setQueryData(voucherKeys.info(address, viewer), voucher);
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: voucherKeys.all,
          predicate: (query) => query.queryKey[2] !== "info",
        }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
      ]);
    },
  });
}
