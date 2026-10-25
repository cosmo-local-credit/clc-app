import { type TableSearch, parseTableSearch } from "#/lib/table-search";

export const POOL_STATUSES = ["all", "active", "retired"] as const;
export type PoolListSearch = TableSearch & { status?: (typeof POOL_STATUSES)[number] };

export function parsePoolListSearch(search: Record<string, unknown>): PoolListSearch {
  const status = POOL_STATUSES.find((candidate) => candidate === search.status);
  return { ...parseTableSearch(search), ...(status && status !== "all" ? { status } : {}) };
}
