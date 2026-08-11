import { useMutation } from "@tanstack/react-query";

import { deployPool } from "@clc/api/features/pools/deploy-client";

export function useDeployPool() {
  return useMutation({ mutationFn: deployPool });
}
