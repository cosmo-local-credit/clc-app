import { queryOptions } from "@tanstack/react-query";
import type { createResourceLimitsClient } from "./client";

export const resourceLimitKeys = {
  all: ["clc", "resource-limits"] as const,
  usage: (address: string) => ["clc", "resource-limits", address.toLowerCase()] as const,
};

export function resourceUsageQueryOptions(
  client: ReturnType<typeof createResourceLimitsClient>,
  address: string,
) {
  return queryOptions({
    queryKey: resourceLimitKeys.usage(address),
    queryFn: ({ signal }) => client.usage(signal),
    enabled: !!address,
    staleTime: 0,
    retry: false,
  });
}
