import { useEffect } from "react";
import { create } from "zustand";

import type { Theme } from "#/providers/theme";

export type MarketMapMode = "standard" | "satellite";

export const MARKET_MAP_MODE_STORAGE_KEY = "clc.market-map-mode";

const MAPTILER_STYLE_ID: Record<Theme, string> = {
  light: "hybrid-v4",
  dark: "hybrid-v4-dark",
};

const STANDARD_STYLE_URL: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/fiord",
};

export function standardMapStyleUrl(theme: Theme): string {
  return STANDARD_STYLE_URL[theme];
}

export function satelliteMapStyleUrl(
  apiKey: string | null | undefined,
  theme: Theme,
): string | null {
  if (!apiKey) return null;
  const style = MAPTILER_STYLE_ID[theme];
  return `https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(apiKey)}`;
}

/*
 * Standard maps intentionally use a keyless provider. A revoked MapTiler key
 * must not make the Marketplace, location pickers, and voucher maps unusable.
 * Satellite remains a MapTiler enhancement and can fall back to Standard.
 */
export function resolveMapStyleUrl(
  apiKey: string | null | undefined,
  theme: Theme,
  mode: MarketMapMode,
): string {
  return mode === "satellite"
    ? (satelliteMapStyleUrl(apiKey, theme) ?? standardMapStyleUrl(theme))
    : standardMapStyleUrl(theme);
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
