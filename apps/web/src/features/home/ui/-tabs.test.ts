import { describe, expect, it } from "vite-plus/test";
import { isPrivateHomeTab, parseHomeTab, parseMarketView } from "./tabs";

describe("parseHomeTab", () => {
  it("returns each valid tab unchanged", () => {
    for (const tab of ["wallet", "activity", "market", "posts", "settings"]) {
      expect(parseHomeTab(tab)).toBe(tab);
    }
  });

  it("returns 'market' for an unknown string", () => {
    expect(parseHomeTab("dashboard")).toBe("market");
  });

  it("returns 'market' for null", () => {
    expect(parseHomeTab(null)).toBe("market");
  });

  it("returns 'market' for undefined", () => {
    expect(parseHomeTab(undefined)).toBe("market");
  });

  it("returns 'market' for a number", () => {
    expect(parseHomeTab(0)).toBe("market");
  });

  it("identifies private tabs", () => {
    expect(isPrivateHomeTab("wallet")).toBe(true);
    expect(isPrivateHomeTab("activity")).toBe(true);
    expect(isPrivateHomeTab("posts")).toBe(true);
    expect(isPrivateHomeTab("settings")).toBe(true);
    expect(isPrivateHomeTab("market")).toBe(false);
  });

  it("defaults the market to the map and accepts only the explicit list view", () => {
    expect(parseMarketView(undefined)).toBe("map");
    expect(parseMarketView("map")).toBe("map");
    expect(parseMarketView("list")).toBe("list");
    expect(parseMarketView("grid")).toBe("map");
  });
});
