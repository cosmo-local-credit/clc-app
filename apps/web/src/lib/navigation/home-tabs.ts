import { isFilterSearchActive } from "@clc/core/features/catalog/logic";

import { pickCatalogSearch } from "#/lib/navigation/catalog-search";

export const publicHomeTabs = ["market"] as const;
export const privateHomeTabs = ["wallet", "activity", "posts", "settings"] as const;
export const homeTabs = ["wallet", "activity", "market", "posts", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];
export type MarketView = "map" | "list";

export function parseHomeTab(value: unknown): HomeTab {
  return homeTabs.includes(value as HomeTab) ? (value as HomeTab) : "market";
}

export function isPrivateHomeTab(tab: HomeTab): boolean {
  return (privateHomeTabs as readonly string[]).includes(tab);
}

export function parseMarketView(value: unknown): MarketView {
  return value === "list" ? "list" : "map";
}

export function isAtHomeTabRoot(search: unknown): boolean {
  const tab = parseHomeTab((search as { tab?: unknown } | null)?.tab);
  if (tab !== "market") return true;
  if (parseMarketView((search as { view?: unknown } | null)?.view) !== "map") return false;
  return !isFilterSearchActive(pickCatalogSearch(search));
}
