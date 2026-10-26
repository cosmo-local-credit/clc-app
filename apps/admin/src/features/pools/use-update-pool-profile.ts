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
 * row and the cache can take it directly. The protected row seeds only the
 * admin detail key; public pool caches are invalidated and must refresh through
 * their redacted endpoint.
 */
export function useUpdatePoolProfile(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: PoolProfileUpdate) => clcApi.admin.updatePoolProfile(address, profile),
    onSuccess: (pool: UserPool) => {
      queryClient.setQueryData(adminKeys.pool(address), pool);
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.all,
          predicate: (query) => query.queryKey[3] !== "detail",
        }),
        queryClient.invalidateQueries({
          queryKey: poolKeys.all,
        }),
        queryClient.invalidateQueries({ queryKey: deploymentKeys.tokenTags() }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
      ]);
    },
  });
}
