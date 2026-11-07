import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { voucherKeys, voucherQueryOptions } from "@clc/api/features/market/queries";
import { poolKeys } from "@clc/api/features/pools/queries";
import type { SafeProposal } from "@clc/api/features/safe/client";
import { wantKeys } from "@clc/api/features/wants/queries";
import { decodeSafeTransactionCalls } from "@clc/core/features/safe/logic";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { marketClient } from "#/lib/api/market";
import { SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";

/**
 * A Safe write ends as a proposal, so nothing in the app sees it execute. When
 * a proposal leaves the queue, what it called is re-read: the vouchers it
 * targeted past the browser's public catalog copy, then every family an
 * ownership change or mint moves.
 */
export function useRefreshAfterSafeExecution() {
  const queryClient = useQueryClient();
  return useCallback(
    async (left: readonly SafeProposal[]) => {
      const targets = new Set(
        left.flatMap((proposal) =>
          (decodeSafeTransactionCalls(proposal, SAFE_MULTISEND_CALL_ONLY) ?? []).map((call) =>
            call.to.toLowerCase(),
          ),
        ),
      );
      // `reload` replaces the HTTP copy as well, so the invalidation below does
      // not read the pre-execution row back from it. A target that is not a
      // voucher (a pool, a wiring contract) simply fails and is skipped.
      await Promise.allSettled(
        [...targets].map((address) =>
          queryClient.fetchQuery({
            ...voucherQueryOptions(marketClient, address, { cache: "reload" }),
            staleTime: 0,
          }),
        ),
      );
      await Promise.allSettled(
        [
          voucherKeys.all,
          poolKeys.all,
          marketplaceKeys.all,
          wantKeys.all,
          accountWalletQueryKeys.all,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    [queryClient],
  );
}
