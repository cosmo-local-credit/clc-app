export const homeTabs = ["wallet", "activity", "market", "pool", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];

export function parseHomeTab(value: unknown): HomeTab {
  return homeTabs.includes(value as HomeTab) ? (value as HomeTab) : "wallet";
}
