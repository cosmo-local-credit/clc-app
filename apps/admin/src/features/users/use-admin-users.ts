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
 * Replaces one account in every cached list, dropping it from the lists it no
 * longer belongs to.
 *
 * Every status filter is a separate cache entry keyed by that status, so an
 * approval has to reach all of them — and approving from the Pending view must
 * remove the row there, not leave an APPROVED account sitting under Pending.
 * Whether a row belongs is decided from the key, which is the only place the
 * filter is recorded.
 */
function useWriteUserToCache() {
  const queryClient = useQueryClient();

  return (updated: AdminUser) => {
    // Each entry is updated by key rather than through `setQueriesData`, whose
    // updater receives only the old data — without the key there is no way to
    // know which status a given cache entry was filtered by.
    const entries = queryClient.getQueryCache().findAll({
      queryKey: [...adminKeys.all, "users"],
    });

    for (const entry of entries) {
      const filter = statusFilterOf(entry.queryKey);

      queryClient.setQueryData<Array<AdminUser>>(entry.queryKey, (cached) => {
        if (!cached) return cached;

        return cached.flatMap((user) => {
          if (user.ethereumAddress.toLowerCase() !== updated.ethereumAddress.toLowerCase()) {
            return [user];
          }
          // The unfiltered list keeps every row; a filtered list keeps it only
          // while it still matches that filter.
          return filter === undefined || filter === updated.status ? [updated] : [];
        });
      });
    }

    // The writes above are deliberately incomplete: a row can be *removed* from a
    // list it no longer matches, but it cannot be *inserted* into the list it now
    // matches without inventing a position in that list's ordering. So the server
    // reconciles. Active lists refetch — normally just the one on screen — and
    // inactive ones are marked stale for their next mount.
    //
    // The optimistic writes still earn their place: they update the visible table
    // immediately instead of after a round trip.
    void queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "users"] });
  };
}

/**
 * The status a cached list was filtered by, or undefined for the unfiltered list.
 *
 * `adminKeys.users` puts the filter last, using the literal "all" when there is
 * none — see packages/api/src/features/admin/queries.ts.
 */
function statusFilterOf(queryKey: readonly unknown[] | undefined): string | undefined {
  const last = queryKey?.at(-1);
  return typeof last === "string" && last !== "all" ? last : undefined;
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
