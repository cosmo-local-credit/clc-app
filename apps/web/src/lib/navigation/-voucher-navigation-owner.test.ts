import { describe, expect, it } from "vite-plus/test";

import { resolveVoucherNavigationOwner } from "./voucher-navigation-owner";

describe("resolveVoucherNavigationOwner", () => {
  it("treats a pool voucher as Wallet-owned even when from=market conflicts", () => {
    expect(
      resolveVoucherNavigationOwner({
        from: "market",
        poolAddress: "0x1111111111111111111111111111111111111111",
      }),
    ).toEqual({
      activeTab: "wallet",
      backDestination: "pool",
      to: "/pools/0x1111111111111111111111111111111111111111",
    });
  });

  it("returns Wallet as both owner and Back destination for a balance voucher", () => {
    expect(resolveVoucherNavigationOwner({ from: "wallet" })).toEqual({
      activeTab: "wallet",
      backDestination: "wallet",
      to: "/",
      search: { tab: "wallet" },
    });
  });

  it("keeps an all-vouchers origin Wallet-owned while returning Back to the list", () => {
    expect(resolveVoucherNavigationOwner({ from: "vouchers" })).toEqual({
      activeTab: "wallet",
      backDestination: "vouchers",
      to: "/wallet/vouchers",
    });
  });

  it("keeps a related voucher Posts-owned and returns to its source post", () => {
    expect(resolveVoucherNavigationOwner({ from: "posts", reportId: "3182" })).toEqual({
      activeTab: "posts",
      backDestination: "posts",
      to: "/posts/3182",
    });
  });

  it("falls back to the Posts list when a post origin has no report id", () => {
    expect(resolveVoucherNavigationOwner({ from: "posts" })).toEqual({
      activeTab: "posts",
      backDestination: "posts",
      to: "/",
      search: { tab: "posts" },
    });
  });

  it("keeps a Want-related voucher Market-owned and returns to its source Want", () => {
    expect(resolveVoucherNavigationOwner({ from: "wants", wantId: "7" })).toEqual({
      activeTab: "market",
      backDestination: "wants",
      to: "/wants/7",
    });
  });

  it("falls back to the Wants scope when a Want origin has no id", () => {
    expect(resolveVoucherNavigationOwner({ from: "wants" })).toEqual({
      activeTab: "market",
      backDestination: "wants",
      to: "/market",
      search: { scope: "wants" },
    });
  });

  it.each([undefined, "market"] as const)("defaults %s origins to Market", (from) => {
    expect(resolveVoucherNavigationOwner({ from })).toEqual({
      activeTab: "market",
      backDestination: "market",
      to: "/",
    });
  });
});
