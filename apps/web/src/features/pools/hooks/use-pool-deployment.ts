import { resourceLimitKeys } from "@clc/api/features/resource-limits/queries";
import type { PoolDeployPayload } from "@clc/core/features/pools/logic";
import { createPoolDeployClient } from "@clc/api/features/pools/deploy-client";
import { nameKeys } from "@clc/api/features/names/queries";
import { symbolKeys } from "@clc/api/features/symbols/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcHttp } from "#/lib/api/http";
import { tokenTagsQueryKey } from "#/hooks/use-deployment";

const poolDeployClient = createPoolDeployClient(clcHttp);

export function useDeployPool() {
  const queryClient = useQueryClient();
  return useMutation({
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
    mutationFn: (payload: PoolDeployPayload) => poolDeployClient.deployPool(payload),
    // The symbol and name just claimed are now occupied for the next form.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: symbolKeys.all }),
        queryClient.invalidateQueries({ queryKey: nameKeys.all }),
        queryClient.invalidateQueries({ queryKey: tokenTagsQueryKey }),
      ]),
  });
}
