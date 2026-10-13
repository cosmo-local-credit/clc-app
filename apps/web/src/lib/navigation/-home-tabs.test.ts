import { describe, expect, it } from "vite-plus/test";
import { isAtHomeTabRoot, isPrivateHomeTab, parseHomeTab, parseMarketView } from "./home-tabs";

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
    expect(isPrivateHomeTab("posts")).toBe(false);
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

describe("isAtHomeTabRoot", () => {
  it("treats every non-market tab as its own root", () => {
    expect(isAtHomeTabRoot({ tab: "wallet" })).toBe(true);
    expect(isAtHomeTabRoot({ tab: "settings", view: "list" })).toBe(true);
  });

  it("ignores retired voucher-sheet state outside the map", () => {
    expect(
      isAtHomeTabRoot({
        tab: "wallet",
        voucher: "0x1111111111111111111111111111111111111111",
      }),
    ).toBe(true);
  });

  it("treats the unfiltered map as the Market root and the list as a descendant", () => {
    expect(isAtHomeTabRoot({ tab: "market" })).toBe(true);
    expect(isAtHomeTabRoot({ tab: "market", view: "map" })).toBe(true);
    expect(isAtHomeTabRoot({ tab: "market", view: "list" })).toBe(false);
  });

  it("does not treat a filtered map as the root", () => {
    expect(isAtHomeTabRoot({ tab: "market", view: "map", q: "art" })).toBe(false);
    expect(isAtHomeTabRoot({ tab: "market", view: "map", tags: "Art" })).toBe(false);
  });

  it("does not treat an over-limit filter as the root either", () => {
    const tags = Array.from({ length: 13 }, (_, index) => `Tag${index}`);
    expect(isAtHomeTabRoot({ tab: "market", view: "map", tags })).toBe(false);
  });

  it("ignores a term too short to filter anything", () => {
    expect(isAtHomeTabRoot({ tab: "market", view: "map", q: "a" })).toBe(true);
    expect(isAtHomeTabRoot({ tab: "market", view: "map", q: "   " })).toBe(true);
  });

  it("ignores voucher filters that Market cannot honor", () => {
    expect(
      isAtHomeTabRoot({
        tab: "market",
        view: "map",
        vouchers: "42220:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toBe(true);
  });
});
