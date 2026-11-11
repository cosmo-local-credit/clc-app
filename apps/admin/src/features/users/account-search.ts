import type { AdminUserStatus } from "@clc/api/features/admin/client";
import { parseTableSearch, type TableSearch } from "#/lib/table-search";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export type AccountSearch = TableSearch & {
  status?: AdminUserStatus;
  role?: "admins";
  lifecycle?: "retired";
};

/** Table search plus an approval status, a role and a lifecycle. Unknown values are dropped. */
export function parseAccountSearch(search: Record<string, unknown>): AccountSearch {
  const table = parseTableSearch(search);
  const raw = typeof search.status === "string" ? search.status.trim().toUpperCase() : "";
  const status = STATUSES.find((item) => item === raw);
  const role = search.role === "admins" ? "admins" : undefined;
  const lifecycle = search.lifecycle === "retired" ? "retired" : undefined;
  return {
    ...table,
    ...(status ? { status } : {}),
    ...(role ? { role } : {}),
    ...(lifecycle ? { lifecycle } : {}),
  };
}
