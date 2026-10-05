import type { PoolProfileUpdate, UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { recipientKeys } from "@clc/api/features/recipients/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { poolsClient } from "#/lib/api/pools";
import { tokenTagsQueryKey } from "#/hooks/use-deployment";

/**
 * The owner's write to their pool's catalog record.
 *
 * A write to the catalog, not the chain, so there is no indexer to wait for:
 * the response carries the saved row and seeds the detail query directly. The
 * pool reads are `no-store`, so unlike the voucher profile there is no browser
 * copy to refresh. The seeded detail is left out of invalidation so it cannot be
 * replaced while the mutation settles. The rest of the pool keys are invalidated
 * because a renamed, re-tagged or relocated pool reads differently in the
 * directory and the facets.
 */
export function useUpdatePoolProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: PoolProfileUpdate) => poolsClient.updatePoolProfile(address, profile),
    onSuccess: (pool: UserPool) => {
      queryClient.setQueryData(poolKeys.detail(address), pool);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: recipientKeys.all }),
        queryClient.invalidateQueries({
          queryKey: poolKeys.all,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
      ]);
    },
  });
}
