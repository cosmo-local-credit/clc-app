import { queryOptions } from "@tanstack/react-query";
import type { createResourceLimitsClient } from "./client";
import { transientBackendReadQueryPolicy } from "../../client/errors";

export const resourceLimitKeys = {
  all: ["clc", "resource-limits"] as const,
  usage: (address: string, voucher?: string) =>
    ["clc", "resource-limits", address.toLowerCase(), voucher?.toLowerCase() ?? null] as const,
};

export function resourceUsageQueryOptions(
  client: ReturnType<typeof createResourceLimitsClient>,
  address: string,
  voucher?: string,
) {
  return queryOptions({
    queryKey: resourceLimitKeys.usage(address, voucher),
    queryFn: ({ signal }) => client.usage({ voucher }, signal),
    enabled: !!address,
    staleTime: 0,
    ...transientBackendReadQueryPolicy,
  });
}
