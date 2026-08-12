/**
 * Canonical query identity for the admin endpoints.
 *
 * There is no `cursor` or `perPage` in any key because the backend accepts
 * neither — see the note in ./client.ts. `status` *is* in the users key, because
 * it is a real server-side filter and two different filters are two different
 * results.
 */

import { queryOptions } from "@tanstack/react-query";

import type { AdminClient, AdminUserStatus } from "./client";

export const adminKeys = {
  all: ["clc", "admin"] as const,
  users: (status?: AdminUserStatus) => ["clc", "admin", "users", status ?? "all"] as const,
} as const;

export function adminUsersQueryOptions(admin: AdminClient, status?: AdminUserStatus) {
  return queryOptions({
    queryKey: adminKeys.users(status),
    queryFn: () => admin.listUsers(status),
  });
}
