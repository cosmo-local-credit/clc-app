import type { PoolProfileUpdate, UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * Saves an operator's edits to a pool's catalog record.
 *
 * Unlike adding a voucher, this is a write to the catalog itself rather than to
 * the chain, so there is no indexer to wait for: the response carries the saved
 * row and the cache can take it directly. The detail query is seeded with it so
 * the screen shows the saved record without a refetch, and the rest of the pool
 * keys are invalidated because a renamed or re-tagged pool reads differently in
 * the directory and the facets.
 */
export function useUpdatePoolProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: PoolProfileUpdate) => clcApi.admin.updatePoolProfile(address, profile),
    onSuccess: (pool: UserPool) => {
      queryClient.setQueryData(poolKeys.detail(address), pool);
      return queryClient.invalidateQueries({ queryKey: poolKeys.all });
    },
  });
}
