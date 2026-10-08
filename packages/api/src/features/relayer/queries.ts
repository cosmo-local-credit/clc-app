import { queryOptions } from "@tanstack/react-query";

import type { RelayerClient } from "./client";

const relayerKeys = {
  health: ["clc", "relayer", "health"] as const,
};

/**
 * The relayer's executor address, chain and capabilities. They change only
 * with a relayer redeploy, so a minute of staleness is fine and saves a round
 * trip on every payment.
 */
export function relayerHealthQueryOptions(client: RelayerClient) {
  return queryOptions({
    queryKey: relayerKeys.health,
    queryFn: async () => (await client.getHealth()).result,
    staleTime: 60_000,
  });
}
