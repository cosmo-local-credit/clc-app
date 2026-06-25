import { describe, expect, it } from "vite-plus/test";
import { isPrivateHomeTab, parseHomeTab } from "./tabs";

describe("parseHomeTab", () => {
  it("returns each valid tab unchanged", () => {
    for (const tab of ["wallet", "activity", "market", "pool", "settings"]) {
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
    expect(isPrivateHomeTab("pool")).toBe(true);
    expect(isPrivateHomeTab("settings")).toBe(true);
    expect(isPrivateHomeTab("market")).toBe(false);
  });
});
