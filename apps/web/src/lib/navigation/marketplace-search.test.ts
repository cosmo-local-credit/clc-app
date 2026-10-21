import { describe, expect, it } from "vite-plus/test";

import {
  canonicalMarketplaceSearch,
  mapSearchFrom,
  marketplaceSearchForScope,
  parseMarketplaceScope,
  pickMarketplaceSearch,
} from "./marketplace-search";

describe("marketplace route search", () => {
  it("names All and the four resource lists, and nothing else", () => {
    expect(parseMarketplaceScope(undefined)).toBeNull();
    expect(parseMarketplaceScope("all")).toBe("all");
    expect(parseMarketplaceScope(" ALL ")).toBe("all");
    expect(parseMarketplaceScope("offers")).toBe("offers");
    expect(parseMarketplaceScope("VOUCHERS")).toBe("vouchers");
    expect(parseMarketplaceScope("everything")).toBeNull();
    expect(parseMarketplaceScope(["all"])).toBeNull();
  });

  it("keeps All and replace-canonicalizes its spelling, invalid, and repeated scopes", () => {
    expect(canonicalMarketplaceSearch({ scope: "all", q: "bike" })).toBeNull();
    expect(canonicalMarketplaceSearch({ scope: "All", q: "bike" })).toEqual({
      scope: "all",
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

  it("opens All with the shared search and without the pool-only filter", () => {
    const previous = pickMarketplaceSearch({
      scope: "pools",
      q: "bike",
      tags: "Repair",
      creditable: true,
      out_voucher: `0x${"a".repeat(40)}`,
    });
    expect(marketplaceSearchForScope(previous, "all")).toMatchObject({
      scope: "all",
      q: "bike",
      tags: "Repair",
      creditable: true,
      out_voucher: undefined,
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

  it("carries only the query, tags and Credit back to the map", () => {
    expect(
      mapSearchFrom({
        scope: "pools",
        q: "bike",
        tags: "Repair",
        tagMatch: "all",
        creditable: true,
        out_voucher: `0x${"a".repeat(40)}`,
      }),
    ).toEqual({ q: "bike", tags: "Repair", tagMatch: "all", creditable: true });
  });
});
