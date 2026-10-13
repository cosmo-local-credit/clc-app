import { describe, expect, it } from "vite-plus/test";

import {
  canonicalMarketplaceSearch,
  isAtMarketplaceRoot,
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

  it("retires the redundant voucher picker state while preserving exact voucher deep links", () => {
    const address = `0x${"a".repeat(40)}`;
    expect(
      canonicalMarketplaceSearch({
        scope: "pools",
        vouchers: `100:${address}`,
        voucherMatch: "all",
        out_voucher: address,
      }),
    ).toMatchObject({
      scope: "pools",
      vouchers: undefined,
      voucherMatch: undefined,
      out_voucher: address,
    });
  });

  it("treats only the unfiltered All list as the bottom-navigation root", () => {
    expect(isAtMarketplaceRoot({})).toBe(true);
    expect(isAtMarketplaceRoot({ scope: "offers" })).toBe(false);
    expect(isAtMarketplaceRoot({ q: "bike" })).toBe(false);
    expect(isAtMarketplaceRoot({ creditable: false })).toBe(false);
  });
});
