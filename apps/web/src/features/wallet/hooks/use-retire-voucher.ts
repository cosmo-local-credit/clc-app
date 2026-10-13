import { resourceLimitKeys } from "@clc/api/features/resource-limits/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
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
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
        queryClient.invalidateQueries({
          queryKey: voucherKeys.all,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all }),
      ]);
    },
  });
}
