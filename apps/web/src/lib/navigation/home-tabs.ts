const privateHomeTabs = ["wallet", "activity", "posts", "settings"] as const;
const homeTabs = ["wallet", "activity", "market", "posts", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];
/** The map is the Market tab; the list is the "Browse all" fallback view. */
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
