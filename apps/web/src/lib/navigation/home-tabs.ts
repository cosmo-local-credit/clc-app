import { isFilterSearchActive } from "@clc/core/features/catalog/logic";
import { isAddress } from "viem";

import { catalogSearchForScope } from "#/lib/navigation/catalog-search";

const privateHomeTabs = ["wallet", "activity", "posts", "settings"] as const;
const homeTabs = ["wallet", "activity", "market", "posts", "settings"] as const;

export type HomeTab = (typeof homeTabs)[number];
export type MarketView = "map" | "list";
export type MarketVoucherTab = "overview" | "offerings" | "reviews";

export type HomeRouteSearch = {
  tab?: HomeTab;
  view?: MarketView;
  /**
   * The voucher whose card is open on the market map. Typed as a string because
   * other routes name a `voucher` too, and links spread one route's search into
   * another's; `parseHomeSearch` admits only an address.
   */
  voucher?: string;
  /** The card's tab once it fills the screen; absent means Overview. */
  voucherTab?: Exclude<MarketVoucherTab, "overview">;
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

/** A checksummed or lower-case address, or nothing. */
export function parseMarketVoucher(value: unknown): `0x${string}` | undefined {
  return typeof value === "string" && isAddress(value) ? value : undefined;
}

export function parseHomeSearch(
  search: Record<string, unknown>,
): HomeRouteSearch & { voucher?: `0x${string}` } {
  const tab = parseHomeTab(search.tab);
  const view = parseMarketView(search.view);
  // A card belongs to the map: neither the list nor another tab shows one.
  const voucher =
    tab === "market" && view === "map" ? parseMarketVoucher(search.voucher) : undefined;
  const voucherTab =
    voucher && (search.voucherTab === "offerings" || search.voucherTab === "reviews")
      ? search.voucherTab
      : undefined;
  return { tab, view, voucher, voucherTab };
}

export function isAtHomeTabRoot(search: unknown): boolean {
  const record = (search ?? {}) as Record<string, unknown>;
  const { tab, view, voucher } = parseHomeSearch(record);
  if (tab !== "market") return true;
  if (view !== "map" || voucher) return false;
  return !isFilterSearchActive(catalogSearchForScope(search, false));
}
