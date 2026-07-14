export const publicHomeTabs = ["market"] as const;
export const privateHomeTabs = ["wallet", "activity", "pool", "settings"] as const;
export const homeTabs = ["wallet", "activity", "market", "pool", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];

export function parseHomeTab(value: unknown): HomeTab {
  return homeTabs.includes(value as HomeTab) ? (value as HomeTab) : "market";
}

export function isPrivateHomeTab(tab: HomeTab): boolean {
  return (privateHomeTabs as readonly string[]).includes(tab);
}
