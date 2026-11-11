/**
 * An account's retirement and moderation history, and the two operator actions
 * that change its lifecycle.
 *
 * Retiring and restoring answer with the lifecycle, not the account row, so there
 * is nothing to write into the directory cache: the account, its pages and the
 * lifecycle and moderation reads are invalidated and the server reconciles.
 */

import { adminKeys } from "@clc/api/features/admin/queries";
import {
  accountRetirementKeys,
  adminAccountRetirementQueryOptions,
  moderationHistoryQueryOptions,
} from "@clc/api/features/account-retirement/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

export function useAccountRetirement(address: string, enabled = true) {
  return useQuery({
    ...adminAccountRetirementQueryOptions(clcApi.accountRetirement, address),
    enabled: enabled && !!address,
  });
}

export function useModerationHistory(address: string) {
  return useQuery(moderationHistoryQueryOptions(clcApi.accountRetirement, address));
}

function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "users"] }),
      queryClient.invalidateQueries({ queryKey: accountRetirementKeys.all }),
    ]);
}

export function useRetireAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ address, reason }: { address: string; reason?: string }) =>
      clcApi.accountRetirement.adminRetire(
        address,
        reason?.trim() ? { reason: reason.trim() } : {},
      ),
    onSuccess: invalidate,
  });
}

export function useRestoreAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (address: string) => clcApi.accountRetirement.adminRestore(address),
    onSuccess: invalidate,
  });
}
