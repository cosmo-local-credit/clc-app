import type { MarketVoucherDetail, VoucherProfileUpdate } from "@clc/api/features/market/client";
import { accountKeys } from "@clc/api/features/accounts/queries";
import { catalogKeys } from "@clc/api/features/catalogs/queries";
import { creditRouterKeys } from "@clc/api/features/credit-router/queries";
import { marketMapKeys } from "@clc/api/features/market-map/queries";
import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { offeringKeys } from "@clc/api/features/offerings/queries";
import { poolKeys } from "@clc/api/features/pools/queries";
import { publicProfileKeys } from "@clc/api/features/public-profiles/queries";
import { reportKeys } from "@clc/api/features/reports/queries";
import { symbolKeys } from "@clc/api/features/symbols/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { wantKeys } from "@clc/api/features/wants/queries";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const auth = useAuthStatus();
  const viewer = auth.isAuthenticated ? auth.session?.address : undefined;

  return useMutation({
    mutationFn: async (profile: VoucherProfileUpdate) => {
      await marketClient.updateVoucherProfile(address, profile);
      const voucher = await marketClient.getVoucherInfo(address);
      if (profile.displaySymbol !== undefined && voucher.displaySymbol !== profile.displaySymbol) {
        throw new Error(t`Couldn't verify the saved symbol.`);
      }
      return voucher;
    },
    onSuccess: (voucher: MarketVoucherDetail, profile) => {
      if (viewer) queryClient.setQueryData(voucherKeys.info(address, viewer), voucher);
      const renamedKeys =
        profile.displaySymbol === undefined
          ? []
          : [
              accountKeys.all,
              catalogKeys.all,
              creditRouterKeys.all,
              marketMapKeys.all,
              marketplaceKeys.all,
              offeringKeys.all,
              poolKeys.all,
              publicProfileKeys.all,
              reportKeys.all,
              symbolKeys.all,
            ];
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: voucherKeys.all,
          predicate: (query) => query.queryKey[2] !== "info",
        }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
        ...renamedKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ]);
    },
  });
}
