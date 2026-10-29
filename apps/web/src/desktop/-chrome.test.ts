import { describe, expect, it } from "vite-plus/test";

import { deskCrumbIds, desktopChrome, desktopNavSelection, marketViewOf } from "./chrome";

describe("desktopNavSelection", () => {
  it("treats the home map as Market with no child", () => {
    expect(desktopNavSelection("/", {})).toEqual({ nav: "market" });
    expect(desktopNavSelection("/", { tab: "market" })).toEqual({ nav: "market" });
  });

  it("highlights a home tab and a market child", () => {
    expect(desktopNavSelection("/", { tab: "wallet" })).toEqual({ nav: "wallet" });
    expect(desktopNavSelection("/market", { scope: "offers" })).toEqual({
      nav: "market",
      scope: "offers",
    });
  });

  it("keeps create flows on the nav the mock names", () => {
    expect(desktopNavSelection("/vouchers/create/place")).toEqual({ nav: "wallet" });
    expect(desktopNavSelection("/catalogs/create")).toEqual({ nav: "wallet" });
    expect(desktopNavSelection("/wallet/wants/new")).toEqual({ nav: "wallet" });
    expect(desktopNavSelection("/pools/create/pool")).toEqual({ nav: "market", scope: "pools" });
    expect(desktopNavSelection("/vouchers/0xabc")).toEqual({ nav: "market", scope: "vouchers" });
    expect(desktopNavSelection("/wants/wnt_1")).toEqual({ nav: "market", scope: "wants" });
    expect(desktopNavSelection("/posts/rpt_1")).toEqual({ nav: "posts" });
    expect(desktopNavSelection("/settings/profile")).toEqual({ nav: "settings" });
  });
});

describe("desktopChrome", () => {
  it("hides the top bar on the map and shows it on a list", () => {
    expect(desktopChrome("/", { tab: "market" })).toBe("map");
    expect(desktopChrome("/market", { scope: "vouchers" })).toBe("map");
    expect(desktopChrome("/market", { scope: "offers", view: "list" })).toBe("fill");
    expect(desktopChrome("/", { tab: "wallet" })).toBe("fill");
  });

  it("falls back unless the route declares a canvas", () => {
    expect(desktopChrome("/install")).toBe("fallback");
    expect(desktopChrome("/pools/0xabc", {}, "fill")).toBe("fill");
  });
});

describe("deskCrumbIds", () => {
  it("names send, cash and create the way the shell does", () => {
    expect(deskCrumbIds("/wallet/send/amount")).toEqual(["wallet", "send"]);
    expect(deskCrumbIds("/wallet/top-up")).toEqual(["wallet", "top-up"]);
    expect(deskCrumbIds("/wallet/cash")).toEqual(["wallet", "cash"]);
    expect(deskCrumbIds("/catalogs/create")).toEqual(["wallet", "create-catalog"]);
    expect(deskCrumbIds("/market", { scope: "pools" })).toEqual(["market", "pools"]);
  });
});

describe("marketViewOf", () => {
  it("reads the Map/List choice the URL carries", () => {
    expect(marketViewOf({ scope: "offers", view: "list" })).toBe("list");
    expect(marketViewOf({ view: "map" })).toBe("map");
  });

  it("reports none when the URL carries none, so links add none", () => {
    expect(marketViewOf({ scope: "offers" })).toBeUndefined();
    expect(marketViewOf({ view: "grid" })).toBeUndefined();
    expect(marketViewOf({ view: undefined })).toBeUndefined();
    expect(marketViewOf(undefined)).toBeUndefined();
    expect(marketViewOf("view=list")).toBeUndefined();
  });

  it("agrees with the chrome: an absent view is the map", () => {
    expect(desktopChrome("/market", { scope: "offers" })).toBe("map");
    expect(desktopChrome("/market", { scope: "offers", view: "list" })).toBe("fill");
  });
});
