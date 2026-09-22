import { describe, expect, it } from "vite-plus/test";

import { deployNameKey, normalizeDeployName } from "./deploy-name";

describe("normalizeDeployName", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeDeployName("  Community   Market  ")).toBe("Community Market");
    expect(normalizeDeployName("Community\tMarket")).toBe("Community Market");
    expect(normalizeDeployName("Community\n\nMarket")).toBe("Community Market");
  });

  it("preserves the case the user typed", () => {
    expect(normalizeDeployName("Community Market")).toBe("Community Market");
    expect(normalizeDeployName("COMMUNITY market")).toBe("COMMUNITY market");
  });

  it("reduces a name that is only whitespace to nothing", () => {
    expect(normalizeDeployName("   ")).toBe("");
    expect(normalizeDeployName("")).toBe("");
  });
});

describe("deployNameKey", () => {
  // The backend folds the same way, so these are exactly the pairs it treats as
  // one name.
  it("folds case as well, so cosmetic edits do not look like a different name", () => {
    const key = deployNameKey("Community Market");
    for (const variant of [
      "community market",
      "COMMUNITY MARKET",
      "  Community   Market  ",
      "Community\tMarket",
    ]) {
      expect(deployNameKey(variant)).toBe(key);
    }
  });

  it("keeps genuinely different names apart", () => {
    expect(deployNameKey("Community Market")).not.toBe(deployNameKey("Community Markets"));
    expect(deployNameKey("Community Market")).not.toBe(deployNameKey("CommunityMarket"));
  });
});
