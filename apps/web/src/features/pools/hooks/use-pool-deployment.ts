import type { PoolDeployPayload } from "@clc/core/features/pools/logic";
import { createPoolDeployClient } from "@clc/api/features/pools/deploy-client";
import { useMutation } from "@tanstack/react-query";

import { clcHttp } from "#/lib/api/http";

const poolDeployClient = createPoolDeployClient(clcHttp);

export function useDeployPool() {
  return useMutation({
    mutationFn: (payload: PoolDeployPayload) => poolDeployClient.deployPool(payload),
  });
}
