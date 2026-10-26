import { describe, expect, it } from "vite-plus/test";

import { resolveMapStyleUrl, satelliteMapStyleUrl, standardMapStyleUrl } from "./map-appearance";

describe("map appearance", () => {
  it.each([
    ["light", "https://tiles.openfreemap.org/styles/liberty"],
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
      "https://tiles.openfreemap.org/styles/liberty",
    );
  });
});
