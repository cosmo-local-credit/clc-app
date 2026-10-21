import { isFilterSearchActive } from "@clc/core/features/catalog/logic";

import { catalogSearchForScope } from "#/lib/navigation/catalog-search";
import {
  parseVoucherSheetSearch,
  type VoucherSheetSearch,
} from "#/lib/navigation/voucher-sheet-search";
import { pickActivitySearch, type ActivityRouteSearch } from "#/lib/navigation/activity-search";

const privateHomeTabs = ["wallet", "activity", "settings"] as const;
const homeTabs = ["wallet", "activity", "market", "posts", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];
export type MarketView = "map" | "list";

export type HomeRouteSearch = VoucherSheetSearch &
  ActivityRouteSearch & {
    tab?: HomeTab;
    view?: MarketView;
  };

export function parseHomeTab(value: unknown): HomeTab {
  return homeTabs.includes(value as HomeTab) ? (value as HomeTab) : "market";
}

export function isPrivateHomeTab(tab: HomeTab): boolean {
  return (privateHomeTabs as readonly string[]).includes(tab);
}

export function parseMarketView(value: unknown): MarketView {
  return value === "list" ? "list" : "map";
}

export function parseHomeSearch(
  search: Record<string, unknown>,
): HomeRouteSearch & { voucher?: `0x${string}` } {
  return {
    tab: parseHomeTab(search.tab),
    view: parseMarketView(search.view),
    ...pickActivitySearch(search),
    ...parseVoucherSheetSearch(search),
  };
}

/**
 * The tab's own destination, where its bottom-navigation button does nothing.
 * Market's is the unfiltered map: a selected pin, a search, tags or Credit
 * all count as somewhere beneath it.
 */
export function isAtHomeTabRoot(search: unknown): boolean {
  const record = (search ?? {}) as Record<string, unknown>;
  const { tab, view, voucher } = parseHomeSearch(record);
  if (tab !== "market") return true;
  if (view !== "map" || voucher) return false;
  if (record.creditable !== undefined) return false;
  return !isFilterSearchActive(catalogSearchForScope(search, false));
}
