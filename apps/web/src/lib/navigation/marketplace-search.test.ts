import { describe, expect, it } from "vite-plus/test";

import {
  canonicalMarketplaceSearch,
  marketplaceSearchForScope,
  parseMarketplaceScope,
  pickMarketplaceSearch,
} from "./marketplace-search";

describe("marketplace route search", () => {
  it("uses absent scope for All and accepts the four resource scopes", () => {
    expect(parseMarketplaceScope(undefined)).toBeNull();
    expect(parseMarketplaceScope("all")).toBeNull();
    expect(parseMarketplaceScope("offers")).toBe("offers");
    expect(parseMarketplaceScope("VOUCHERS")).toBe("vouchers");
  });

  it("replace-canonicalizes explicit All, invalid, and repeated scopes", () => {
    expect(canonicalMarketplaceSearch({ scope: "all", q: "bike" })).toEqual({
      scope: undefined,
      q: "bike",
    });
    expect(canonicalMarketplaceSearch({ scope: "wrong", tags: "Repair" })).toEqual({
      scope: undefined,
      tags: "Repair",
    });
    expect(canonicalMarketplaceSearch({ scope: ["offers", "pools"], q: "bike" })).toEqual({
      scope: undefined,
      q: "bike",
    });
  });

  it("removes pool-only filters when leaving Pools and preserves shared state", () => {
    const previous = pickMarketplaceSearch({
      scope: "pools",
      q: "bike",
      tags: "Repair",
      creditable: true,
      out_voucher: `0x${"a".repeat(40)}`,
    });
    expect(marketplaceSearchForScope(previous, "offers")).toMatchObject({
      scope: "offers",
      q: "bike",
      tags: "Repair",
      creditable: true,
      out_voucher: undefined,
    });
  });
});
