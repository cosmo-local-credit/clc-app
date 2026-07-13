export const homeTabs = ["wallet", "activity", "market", "pool", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];

export const homeTabPaths = {
  wallet: "/",
  activity: "/activity",
  market: "/market",
  pool: "/pool",
  settings: "/settings",
} as const satisfies Record<HomeTab, string>;

export type HomeTabPath = (typeof homeTabPaths)[HomeTab];

export function parseHomeTab(value: unknown): HomeTab {
  return homeTabs.includes(value as HomeTab) ? (value as HomeTab) : "wallet";
}
