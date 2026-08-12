/**
 * Typed search params for the account directory.
 *
 * Deliberately not `parseTableSearch`: that carries `cursor`, `perPage` and
 * `dir`, and `/admin/users` accepts none of them — it returns every row. Offering
 * pagination controls over a response that is already complete would be a lie in
 * the UI, so the only URL state here is the status filter, which *is* a real
 * server-side parameter, plus client-side sort.
 */

import type { AdminUserStatus } from "@clc/api/features/admin/client";

export const USER_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export type UsersSearch = {
  /** Undefined means every account, which is what the endpoint returns unfiltered. */
  status?: AdminUserStatus;
  sort?: string;
  desc?: boolean;
};

export function parseUsersSearch(input: Record<string, unknown>): UsersSearch {
  const status = typeof input.status === "string" ? input.status.toUpperCase() : undefined;
  const sort = typeof input.sort === "string" && input.sort ? input.sort : undefined;

  return {
    // An unrecognized status is dropped rather than passed through: the backend
    // would return an empty list for it, which reads as "no accounts".
    status: USER_STATUSES.find((candidate) => candidate === status),
    sort,
    // `desc` only means anything alongside a sort column.
    desc: sort ? input.desc === true || input.desc === "true" : undefined,
  };
}
