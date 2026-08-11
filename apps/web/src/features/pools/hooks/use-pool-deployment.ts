import type { PoolDeployPayload } from "@clc/core/features/pools/logic";
import { useMutation } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";

export function useDeployPool() {
  return useMutation({
    mutationFn: (payload: PoolDeployPayload) => clcApi.poolDeploy.deployPool(payload),
  });
}
