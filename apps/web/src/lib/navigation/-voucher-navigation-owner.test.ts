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

  it.each([undefined, "market"] as const)("defaults %s origins to Market", (from) => {
    expect(resolveVoucherNavigationOwner({ from })).toEqual({
      activeTab: "market",
      backDestination: "market",
      to: "/",
    });
  });
});
