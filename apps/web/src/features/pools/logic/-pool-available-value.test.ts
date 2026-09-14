import { describe, expect, it } from "vite-plus/test";

import { formatPoolAvailableValue } from "./pool-available-value";

describe("formatPoolAvailableValue", () => {
  it("converts pool holdings through the voucher's unit of account", () => {
    expect(
      formatPoolAvailableValue({
        balanceRaw: "4250000000",
        decimals: 6,
        voucherValue: "1",
        voucherUoa: "KES",
      }),
    ).toEqual({ value: "4250", unit: "KES" });
  });

  it("returns null when the pool holds nothing of the voucher", () => {
    expect(
      formatPoolAvailableValue({
        balanceRaw: "0",
        decimals: 6,
        voucherValue: "1",
        voucherUoa: "KES",
      }),
    ).toBeNull();
  });

  it("returns null when the voucher has no unit of account rate", () => {
    expect(
      formatPoolAvailableValue({
        balanceRaw: "1000000",
        decimals: 6,
        voucherValue: null,
        voucherUoa: null,
      }),
    ).toBeNull();
  });
});
