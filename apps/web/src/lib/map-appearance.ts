import { useEffect } from "react";
import { create } from "zustand";

import type { Theme } from "#/providers/theme";

export type MarketMapMode = "standard" | "satellite";

export const MARKET_MAP_MODE_STORAGE_KEY = "clc.market-map-mode";

const STYLE_ID: Record<Theme, Record<MarketMapMode, string>> = {
  light: {
    standard: "base-v4-light",
    satellite: "hybrid-v4",
  },
  dark: {
    standard: "base-v4-dark",
    satellite: "hybrid-v4-dark",
  },
};

export function resolveMapTilerStyleId(theme: Theme, mode: MarketMapMode): string {
  return STYLE_ID[theme][mode];
}

export function mapTilerStyleUrl(
  apiKey: string | null | undefined,
  theme: Theme,
  mode: MarketMapMode,
): string | null {
  if (!apiKey) return null;
  const style = resolveMapTilerStyleId(theme, mode);
  return `https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(apiKey)}`;
}

export function readInitialMarketMapMode(): MarketMapMode {
  if (typeof window === "undefined") return "standard";
  try {
    return window.localStorage.getItem(MARKET_MAP_MODE_STORAGE_KEY) === "satellite"
      ? "satellite"
      : "standard";
  } catch {
    return "standard";
  }
}

type MarketMapModeState = {
  mode: MarketMapMode;
  setMode: (mode: MarketMapMode) => void;
};

/** Device-local map presentation. It intentionally is not route state. */
export const useMarketMapModeStore = create<MarketMapModeState>((set) => ({
  // Match the server render. The hydrated hook reads localStorage after mount.
  mode: "standard",
  setMode: (mode) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(MARKET_MAP_MODE_STORAGE_KEY, mode);
      } catch {}
    }
    set({ mode });
  },
}));

export function useHydratedMarketMapMode() {
  const mode = useMarketMapModeStore((state) => state.mode);
  const setMode = useMarketMapModeStore((state) => state.setMode);

  useEffect(() => {
    const initial = readInitialMarketMapMode();
    if (initial !== useMarketMapModeStore.getState().mode) {
      useMarketMapModeStore.setState({ mode: initial });
    }
  }, []);

  return { mode, setMode };
}
