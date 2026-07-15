import { describe, expect, it } from "vite-plus/test";

import type { UserPool } from "#/features/pools/api/pools-client";
import { getPlaceholderPoolVouchers } from "./placeholder-pool-vouchers";

const basePool: UserPool = {
  id: "1",
  address: "0x1111111111111111111111111111111111111111",
  name: "Community Garden",
  symbol: "GRDN",
  description: "Shared growing, produce, and local exchange.",
  imageUrl: null,
  tags: ["Food", "Growing"],
  tokenRegistryAddress: null,
  feePolicyAddress: null,
  quoterAddress: null,
  feesDecoupled: false,
  locationName: null,
};

describe("placeholder pool vouchers", () => {
  it("returns deterministic display-only vouchers without mutating the pool", () => {
    const before = structuredClone(basePool);

    const first = getPlaceholderPoolVouchers(basePool);
    const second = getPlaceholderPoolVouchers(basePool);

    expect(first).toEqual(second);
    expect(basePool).toEqual(before);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((voucher) => voucher.isPlaceholder)).toBe(true);
    expect(first.every((voucher) => voucher.tokenAddress === null)).toBe(true);
  });

  it("returns food-themed vouchers for food pools and a generic fallback otherwise", () => {
    const food = getPlaceholderPoolVouchers({
      ...basePool,
      name: "Fresh Food Circle",
      symbol: "FFC",
    });
    const generic = getPlaceholderPoolVouchers({ ...basePool, name: "Repair Pool", symbol: "RPR" });

    expect(food.map((voucher) => voucher.name).join(" ")).toMatch(/Fresh Food Circle|Grain Basket/);
    expect(generic[0]?.name).toBe("Repair Pool Voucher");
  });
});
