import type { PoolProfileUpdate, UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { adminKeys } from "@clc/api/features/admin/queries";
import { deploymentKeys } from "@clc/api/features/deployments/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * Saves an operator's edits to a pool's catalog record.
 *
 * Unlike adding a voucher, this is a write to the catalog itself rather than to
 * the chain, so there is no indexer to wait for: the response carries the saved
 * row and the cache can take it directly. The detail query is seeded with it and
 * left out of invalidation so no follow-up read can replace the authoritative
 * result. The rest of the pool keys are invalidated because a renamed or
 * re-tagged pool reads differently in the directory and the facets.
 */
export function useUpdatePoolProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: PoolProfileUpdate) => clcApi.admin.updatePoolProfile(address, profile),
    onSuccess: (pool: UserPool) => {
      queryClient.setQueryData(adminKeys.pool(address), pool);
      // Public entries must never receive a retired record from an admin write.
      if (pool.active !== false) queryClient.setQueryData(poolKeys.detail(address), pool);
      else queryClient.removeQueries({ queryKey: poolKeys.detail(address) });
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.all,
          predicate: (query) => query.queryKey[3] !== "detail",
        }),
        queryClient.invalidateQueries({
          queryKey: poolKeys.all,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        queryClient.invalidateQueries({ queryKey: deploymentKeys.tokenTags() }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
      ]);
    },
  });
}
