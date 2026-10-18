import { offeringKeys } from "@clc/api/features/offerings/queries";
import { poolKeys } from "@clc/api/features/pools/queries";
import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { catalogKeys } from "@clc/api/features/catalogs/queries";
import { resourceLimitKeys } from "@clc/api/features/resource-limits/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { ownedVoucherKeys } from "@clc/api/features/vouchers/owned-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { marketClient } from "#/lib/api/market";

/**
 * Takes the owner's voucher out of the public catalog.
 *
 * Unlike the profile write beside it there is nothing to seed: clc-core answers
 * with no row because the row it wrote is no longer visible to the detail GET,
 * and re-reading it would only return a 404. So the detail entry is removed
 * rather than replaced — a cached voucher left behind would render a screen the
 * backend no longer serves.
 *
 * The rest of the voucher keys are invalidated because the retire changes what
 * the market list, the viewport reads and the facets return, and the wallet keys
 * because the voucher's own page and any list that named it now read differently.
 */
export function useRetireVoucher(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => marketClient.retireVoucher(address),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: voucherKeys.detail(address) });
      // Clear cached offers immediately, including inactive views. Public reads
      // use no-store so refetches cannot reintroduce a browser-cached result.
      return Promise.all([
        queryClient.resetQueries({ queryKey: offeringKeys.all }),
        queryClient.resetQueries({ queryKey: marketplaceKeys.all }),
        queryClient.resetQueries({ queryKey: poolKeys.all }),
        queryClient.resetQueries({ queryKey: catalogKeys.all }),
        queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
        queryClient.invalidateQueries({
          queryKey: voucherKeys.all,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ownedVoucherKeys.all }),
      ]);
    },
  });
}
