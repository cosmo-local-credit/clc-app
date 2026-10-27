import type { PoolProfileUpdate, UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { recipientKeys } from "@clc/api/features/recipients/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { wantKeys } from "@clc/api/features/wants/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { poolsClient } from "#/lib/api/pools";
import { tokenTagsQueryKey } from "#/hooks/use-deployment";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

/**
 * The owner's write to their pool's catalog record.
 *
 * A profile write may return protected contacts. Read the complete row through
 * the private endpoint and seed only the wallet-scoped info key. Public detail,
 * lists, recipient labels and facets are invalidated independently; the fresh
 * private row stays authoritative while those public projections refresh.
 */
export function useUpdatePoolProfile(address: string) {
  const queryClient = useQueryClient();
  const auth = useAuthStatus();
  const viewer = auth.isAuthenticated ? auth.session?.address : undefined;

  return useMutation({
    mutationFn: async (profile: PoolProfileUpdate) => {
      await poolsClient.updatePoolProfile(address, profile);
      return poolsClient.getPoolInfo(address);
    },
    onSuccess: (pool: UserPool) => {
      if (viewer) queryClient.setQueryData(poolKeys.info(address, viewer), pool);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: recipientKeys.all }),
        queryClient.invalidateQueries({
          queryKey: poolKeys.all,
          predicate: (query) => query.queryKey[2] !== "info",
        }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
      ]);
    },
  });
}
