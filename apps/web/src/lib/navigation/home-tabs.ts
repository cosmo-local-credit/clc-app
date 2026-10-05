import { isFilterSearchActive } from "@clc/core/features/catalog/logic";

import { catalogSearchForScope } from "#/lib/navigation/catalog-search";
import {
  parseVoucherSheetSearch,
  type VoucherSheetSearch,
} from "#/lib/navigation/voucher-sheet-search";

const privateHomeTabs = ["wallet", "activity", "settings"] as const;
const homeTabs = ["wallet", "activity", "market", "posts", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];
export type MarketView = "map" | "list";

export type HomeRouteSearch = VoucherSheetSearch & {
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
    ...parseVoucherSheetSearch(search),
  };
}

export function isAtHomeTabRoot(search: unknown): boolean {
  const record = (search ?? {}) as Record<string, unknown>;
  const { tab, view, voucher } = parseHomeSearch(record);
  // An open card is a step down from whichever tab it opened on.
  if (voucher) return false;
  if (tab !== "market") return true;
  if (view !== "map") return false;
  return !isFilterSearchActive(catalogSearchForScope(search, false));
}
