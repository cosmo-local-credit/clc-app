/**
 * The account directory and the three operations clc-core exposes over it.
 *
 * Every mutation returns the updated row, so the cache is written directly rather
 * than refetched. That matters more here than usual: `/admin/users` is
 * unpaginated, so a refetch after each approval re-downloads every account.
 * Invalidation is still requested afterwards, marking the list stale without
 * forcing an immediate fetch, so a later visit sees the server's version.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AdminUser, AdminUserLimits, AdminUserStatus } from "@clc/api/features/admin/client";
import { adminKeys, adminUsersQueryOptions } from "@clc/api/features/admin/queries";
import { clcApi } from "#/lib/api";

export function useAdminUsers(status?: AdminUserStatus) {
  return useQuery(adminUsersQueryOptions(clcApi.admin, status));
}

/**
 * Replaces one account in every cached list that holds it.
 *
 * Every status filter is its own cache entry, so an approval has to reach all of
 * them — and a row whose new status no longer matches a filtered list is dropped
 * from it rather than left showing a stale status.
 */
function useWriteUserToCache() {
  const queryClient = useQueryClient();

  return (updated: AdminUser) => {
    queryClient.setQueriesData<Array<AdminUser>>(
      { queryKey: [...adminKeys.all, "users"] },
      (cached) => {
        if (!cached) return cached;
        return cached.flatMap((user) => {
          if (user.ethereumAddress.toLowerCase() !== updated.ethereumAddress.toLowerCase()) {
            return [user];
          }
          return [updated];
        });
      },
    );

    // The filtered lists are the ones that may now hold a row that no longer
    // belongs, so let the server decide their contents on next read.
    void queryClient.invalidateQueries({
      queryKey: [...adminKeys.all, "users"],
      refetchType: "none",
    });
  };
}

export function useApproveUser() {
  const writeUser = useWriteUserToCache();

  return useMutation({
    mutationFn: (address: string) => clcApi.admin.approveUser(address),
    onSuccess: writeUser,
  });
}

export function useRejectUser() {
  const writeUser = useWriteUserToCache();

  return useMutation({
    mutationFn: (address: string) => clcApi.admin.rejectUser(address),
    onSuccess: writeUser,
  });
}

export function useUpdateUserLimits() {
  const writeUser = useWriteUserToCache();

  return useMutation({
    mutationFn: ({ address, limits }: { address: string; limits: AdminUserLimits }) =>
      clcApi.admin.updateUserLimits(address, limits),
    onSuccess: writeUser,
  });
}
