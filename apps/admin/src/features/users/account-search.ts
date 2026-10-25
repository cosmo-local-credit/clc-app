import type { AdminUserStatus } from "@clc/api/features/admin/client";
import { parseTableSearch, type TableSearch } from "#/lib/table-search";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export type AccountSearch = TableSearch & {
  status?: AdminUserStatus;
};

/** Table search plus one approval status. An unknown status is dropped. */
export function parseAccountSearch(search: Record<string, unknown>): AccountSearch {
  const table = parseTableSearch(search);
  const raw = typeof search.status === "string" ? search.status.trim().toUpperCase() : "";
  const status = STATUSES.find((item) => item === raw);
  return { ...table, ...(status ? { status } : {}) };
}
