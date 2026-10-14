export const POOL_DETAIL_TABS = [
  "vouchers",
  "holdings",
  "credit",
  "feeds",
  "offerings",
  "activity",
] as const;

export type PoolDetailTab = (typeof POOL_DETAIL_TABS)[number];

export type PoolDetailSearch = {
  tab: PoolDetailTab;
};

/**
 * An unknown tab, including the retired `overview` value, normalizes to the
 * vouchers record. Overview content lives above the tabs, the same way the
 * account profile sits above account records.
 */
export function parsePoolDetailSearch(search: Record<string, unknown>): PoolDetailSearch {
  const tab = POOL_DETAIL_TABS.find((candidate) => candidate === search.tab);
  return { tab: tab ?? "vouchers" };
}
