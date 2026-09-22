import { type TableSearch, parseTableSearch } from "#/lib/table-search";

/**
 * The visibility segment of the voucher list, in the URL with the rest of the
 * table's state so Back restores the view an operator was actually looking at.
 *
 * `all` is the default and is the console's normal reading: someone arriving
 * here is usually looking for a voucher, not for a status. `retired` is the
 * restore queue.
 */
export const VOUCHER_STATUSES = ["all", "active", "retired"] as const;

type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export type VoucherListSearch = TableSearch & {
  /** Absent means `all`, so the default view carries no parameter in the URL. */
  status?: VoucherStatus;
};

export function parseVoucherListSearch(search: Record<string, unknown>): VoucherListSearch {
  const status = VOUCHER_STATUSES.find((candidate) => candidate === search.status);
  return {
    ...parseTableSearch(search),
    ...(status && status !== "all" ? { status } : {}),
  };
}
