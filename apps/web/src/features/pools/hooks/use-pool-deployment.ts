import { useMutation } from "@tanstack/react-query";

import { deployPool } from "#/features/pools/api/pool-deploy-client";

export function useDeployPool() {
  return useMutation({ mutationFn: deployPool });
}
