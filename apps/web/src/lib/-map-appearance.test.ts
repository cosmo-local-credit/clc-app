import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  MARKET_MAP_MODE_STORAGE_KEY,
  mapTilerStyleUrl,
  readInitialMarketMapMode,
  resolveMapTilerStyleId,
  useMarketMapModeStore,
} from "./map-appearance";

beforeEach(() => {
  window.localStorage.clear();
  useMarketMapModeStore.setState({ mode: "standard" });
});

describe("map appearance", () => {
  it.each([
    ["light", "standard", "base-v4-light"],
    ["dark", "standard", "base-v4-dark"],
    ["light", "satellite", "hybrid-v4"],
    ["dark", "satellite", "hybrid-v4-dark"],
  ] as const)("resolves %s %s to %s", (theme, mode, expected) => {
    expect(resolveMapTilerStyleId(theme, mode)).toBe(expected);
  });

  it("builds an encoded MapTiler style URL and rejects a missing key", () => {
    expect(mapTilerStyleUrl("test key", "dark", "satellite")).toBe(
      "https://api.maptiler.com/maps/hybrid-v4-dark/style.json?key=test%20key",
    );
    expect(mapTilerStyleUrl("", "light", "standard")).toBeNull();
  });

  it("defaults absent and malformed preferences to standard", () => {
    expect(readInitialMarketMapMode()).toBe("standard");
    window.localStorage.setItem(MARKET_MAP_MODE_STORAGE_KEY, "terrain");
    expect(readInitialMarketMapMode()).toBe("standard");
  });

  it("reads and persists the satellite preference", () => {
    window.localStorage.setItem(MARKET_MAP_MODE_STORAGE_KEY, "satellite");
    expect(readInitialMarketMapMode()).toBe("satellite");

    useMarketMapModeStore.getState().setMode("standard");
    expect(window.localStorage.getItem(MARKET_MAP_MODE_STORAGE_KEY)).toBe("standard");
  });
});
