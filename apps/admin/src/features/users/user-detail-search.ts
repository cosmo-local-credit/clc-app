import { parseTableSearch, type TableSearch } from "#/lib/table-search";

export const ACCOUNT_DETAIL_TABS = ["transactions", "reports", "vouchers", "pools"] as const;

export type AccountDetailTab = (typeof ACCOUNT_DETAIL_TABS)[number];

/**
 * The open tab plus the record table's own page state.
 *
 * Both live in the URL for the same reason every other admin table does: the view
 * is linkable, and Back returns an operator to the page and tab they were reading
 * rather than to the top of a reset table.
 */
export type UserDetailSearch = TableSearch & {
  tab: AccountDetailTab;
};

/**
 * An unknown tab normalizes to the default rather than throwing: a hand-edited or
 * stale URL should degrade to a usable screen. `parseTableSearch` applies the same
 * rule to the page size and cursor.
 */
export function parseUserDetailSearch(search: Record<string, unknown>): UserDetailSearch {
  const tab = ACCOUNT_DETAIL_TABS.find((candidate) => candidate === search.tab);
  return { ...parseTableSearch(search), tab: tab ?? "transactions" };
}
