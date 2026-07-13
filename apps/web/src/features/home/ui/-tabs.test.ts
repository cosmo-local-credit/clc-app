import { describe, expect, it } from "vite-plus/test";
import { homeTabPaths, isPrivateHomeTab, parseHomeTab } from "./tabs";

describe("parseHomeTab", () => {
  it("returns each valid tab unchanged", () => {
    for (const tab of ["wallet", "activity", "market", "pool", "settings"] as const) {
      expect(parseHomeTab(tab)).toBe(tab);
    }
  });

  it("returns 'market' for invalid values", () => {
    expect(parseHomeTab("dashboard")).toBe("market");
    expect(parseHomeTab(null)).toBe("market");
    expect(parseHomeTab(undefined)).toBe("market");
    expect(parseHomeTab(0)).toBe("market");
  });

  it("identifies private tabs", () => {
    expect(isPrivateHomeTab("wallet")).toBe(true);
    expect(isPrivateHomeTab("activity")).toBe(true);
    expect(isPrivateHomeTab("pool")).toBe(true);
    expect(isPrivateHomeTab("settings")).toBe(true);
    expect(isPrivateHomeTab("market")).toBe(false);
  });
});

describe("homeTabPaths", () => {
  it("maps tab state to first-class app paths", () => {
    expect(homeTabPaths).toEqual({
      wallet: "/",
      activity: "/activity",
      market: "/market",
      pool: "/pool",
      settings: "/settings",
    });
  });
});
