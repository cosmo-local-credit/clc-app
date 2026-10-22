import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  MARKET_MAP_MODE_STORAGE_KEY,
  readInitialMarketMapMode,
  resolveMapStyleUrl,
  satelliteMapStyleUrl,
  standardMapStyleUrl,
  useMarketMapModeStore,
} from "./map-appearance";

beforeEach(() => {
  window.localStorage.clear();
  useMarketMapModeStore.setState({ mode: "standard" });
});

describe("map appearance", () => {
  it.each([
    ["light", "https://tiles.openfreemap.org/styles/positron"],
    ["dark", "https://tiles.openfreemap.org/styles/fiord"],
  ] as const)("resolves the %s standard map without a provider key", (theme, expected) => {
    expect(standardMapStyleUrl(theme)).toBe(expected);
    expect(resolveMapStyleUrl(null, theme, "standard")).toBe(expected);
  });

  it("builds an encoded MapTiler satellite URL and falls back without a key", () => {
    expect(satelliteMapStyleUrl("test key", "dark")).toBe(
      "https://api.maptiler.com/maps/hybrid-v4-dark/style.json?key=test%20key",
    );
    expect(satelliteMapStyleUrl("", "light")).toBeNull();
    expect(resolveMapStyleUrl("", "light", "satellite")).toBe(
      "https://tiles.openfreemap.org/styles/positron",
    );
  });

  it("defaults absent and malformed preferences to standard", () => {
    expect(readInitialMarketMapMode()).toBe("standard");
    window.localStorage.setItem(MARKET_MAP_MODE_STORAGE_KEY, "terrain");
    expect(readInitialMarketMapMode()).toBe("standard");
  });

  it("defaults to standard when device storage cannot be read", () => {
    const localStorage = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(readInitialMarketMapMode()).toBe("standard");
    localStorage.mockRestore();
  });

  it("reads and persists the satellite preference", () => {
    window.localStorage.setItem(MARKET_MAP_MODE_STORAGE_KEY, "satellite");
    expect(readInitialMarketMapMode()).toBe("satellite");

    useMarketMapModeStore.getState().setMode("standard");
    expect(window.localStorage.getItem(MARKET_MAP_MODE_STORAGE_KEY)).toBe("standard");
  });
});
