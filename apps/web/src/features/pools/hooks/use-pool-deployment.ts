import { resourceLimitKeys } from "@clc/api/features/resource-limits/queries";
import type { PoolDeployPayload } from "@clc/core/features/pools/logic";
import { createPoolDeployClient } from "@clc/api/features/pools/deploy-client";
import { nameKeys } from "@clc/api/features/names/queries";
import { symbolKeys } from "@clc/api/features/symbols/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcHttp } from "#/lib/api/http";
import { tokenTagsQueryKey } from "#/hooks/use-deployment";

const poolDeployClient = createPoolDeployClient(clcHttp);

/**
 * Names every pool publish, so a view that mounts while one is still in flight
 * (the phone/desktop swap) can see it and hold its own Publish.
 */
export const deployPoolMutationKey = ["pools", "deploy"] as const;

export function useDeployPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: deployPoolMutationKey,
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
    mutationFn: (payload: PoolDeployPayload) => poolDeployClient.deployPool(payload),
    // The symbol and name just claimed are now occupied for the next form.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: symbolKeys.all }),
        queryClient.invalidateQueries({ queryKey: nameKeys.all }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
        queryClient.invalidateQueries({ queryKey: vocabularyKeys.all }),
      ]),
  });
}
