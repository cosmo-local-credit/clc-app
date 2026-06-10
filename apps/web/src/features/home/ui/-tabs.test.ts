import { describe, expect, it } from "vite-plus/test";
import { parseHomeTab } from "./tabs";

describe("parseHomeTab", () => {
  it("returns each valid tab unchanged", () => {
    for (const tab of ["wallet", "activity", "market", "pool", "settings"]) {
      expect(parseHomeTab(tab)).toBe(tab);
    }
  });

  it("returns 'wallet' for an unknown string", () => {
    expect(parseHomeTab("dashboard")).toBe("wallet");
  });

  it("returns 'wallet' for null", () => {
    expect(parseHomeTab(null)).toBe("wallet");
  });

  it("returns 'wallet' for undefined", () => {
    expect(parseHomeTab(undefined)).toBe("wallet");
  });

  it("returns 'wallet' for a number", () => {
    expect(parseHomeTab(0)).toBe("wallet");
  });
});
