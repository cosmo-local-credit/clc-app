import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export type MarketView = "map" | "list";

/** What a first visit opens: the map, as the market always has. */
const DEFAULT_MARKET_VIEW: MarketView = "map";

export const MARKET_VIEW_STORAGE_KEY = "clc.desktop.market-view";

/** The last Map/List view shown on this device, or null before the first. */
function readMarketView(): MarketView | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(MARKET_VIEW_STORAGE_KEY);
    return value === "map" || value === "list" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Which view the market opens in. The URL's `view` wins, since it is what a
 * shared link or a click on Map | List says. A link that names none, as the
 * sidebar's and the breadcrumbs' scope links must not, takes the view the person
 * last used; only a first visit gets {@link DEFAULT_MARKET_VIEW}.
 */
export function resolveMarketView(urlView: MarketView | undefined): MarketView {
  return urlView ?? readMarketView() ?? DEFAULT_MARKET_VIEW;
}

/** Remembers the view being shown, so the next link that names none opens in it. */
export function useRememberMarketView(view: MarketView) {
  useEffect(() => {
    try {
      window.localStorage.setItem(MARKET_VIEW_STORAGE_KEY, view);
    } catch {
      // A private window keeps the choice in the URL for this document only.
    }
  }, [view]);
}

/**
 * Writes the resolved view into a /market URL that lacks one, replacing the
 * entry. A card opened over the map or the list keeps its place through `view`,
 * so a link without one is completed as soon as the view is known.
 */
export function useCompleteMarketViewUrl(view: MarketView, urlView: MarketView | undefined) {
  const navigate = useNavigate();
  useEffect(() => {
    if (urlView === view) return;
    void navigate({
      to: "/market",
      search: (previous) => ({ ...previous, view }),
      replace: true,
    });
  }, [navigate, urlView, view]);
}
