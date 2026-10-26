import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import {
  adminRetirementRequestsQueryOptions,
  retirementKeys,
} from "@clc/api/features/retirement/queries";
import { adminKeys } from "@clc/api/features/admin/queries";
import { poolKeys } from "@clc/api/features/pools/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";

export const RETIREMENT_POLL_MS = 30_000;

export function usePendingRetirementCount() {
  return useQuery({
    ...adminRetirementRequestsQueryOptions(clcApi.retirement, { status: "pending", perPage: 1 }),
    select: (page) => page.pendingCount,
    refetchInterval: RETIREMENT_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
}

export function useRetirementInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: retirementKeys.all }),
      queryClient.invalidateQueries({ queryKey: adminKeys.all }),
      queryClient.invalidateQueries({ queryKey: poolKeys.all }),
      queryClient.invalidateQueries({ queryKey: voucherKeys.all }),
    ]);
}

export function useRestoreResource(type: RetirementResourceType, address: string) {
  const invalidate = useRetirementInvalidation();
  return useMutation({
    mutationFn: (reason: string) => clcApi.retirement.restore(type, address, { reason }),
    onSuccess: invalidate,
  });
}
