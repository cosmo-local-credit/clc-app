import { createResourceLimitsClient } from "@clc/api/features/resource-limits/client";
import { resourceUsageQueryOptions } from "@clc/api/features/resource-limits/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { clcHttp } from "#/lib/api/http";

const client = createResourceLimitsClient(clcHttp);

export function useResourceUsage(enabled = true, voucher?: string) {
  const auth = useAuthStatus();
  return useQuery(
    resourceUsageQueryOptions(
      client,
      enabled && auth.isAuthenticated ? (auth.session?.address ?? "") : "",
      voucher,
    ),
  );
}
