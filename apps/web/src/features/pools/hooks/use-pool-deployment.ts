import type { PoolDeployPayload } from "@clc/core/features/pools/logic";
import { createPoolDeployClient } from "@clc/api/features/pools/deploy-client";
import { symbolKeys } from "@clc/api/features/symbols/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clcHttp } from "#/lib/api/http";

const poolDeployClient = createPoolDeployClient(clcHttp);

export function useDeployPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PoolDeployPayload) => poolDeployClient.deployPool(payload),
    // The symbol just claimed is now occupied for the next form.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: symbolKeys.all }),
  });
}
