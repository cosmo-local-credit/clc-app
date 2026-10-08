import { describe, expect, it } from "vite-plus/test";

import { formatPoolFeePercent, formatPoolSwapFee } from "./pool-swap-fees";

describe("pool swap fee display", () => {
  it("shows a fee below two decimals as less than the smallest shown amount", () => {
    expect(formatPoolSwapFee("400", 6, "en")).toBe("<0.01");
    expect(formatPoolSwapFee("9999", 6, "en")).toBe("<0.01");
    expect(formatPoolSwapFee("10000", 6, "en")).toBe("0.01");
  });

  it("keeps a true zero as zero", () => {
    expect(formatPoolSwapFee("0", 6, "en")).toBe("0.00");
  });

  it("never marks a voucher with two or fewer decimals as below display", () => {
    expect(formatPoolSwapFee("1", 2, "en")).toBe("0.01");
    expect(formatPoolSwapFee("1", 0, "en")).toBe("1.00");
  });

  it("formats the rate to the ppm in the reader's locale", () => {
    expect(formatPoolFeePercent("20000", "en")).toBe("2%");
    expect(formatPoolFeePercent("5700", "en")).toBe("0.57%");
    expect(formatPoolFeePercent("1", "en")).toBe("0.0001%");
    expect(formatPoolFeePercent("0", "en")).toBe("0%");
  });
});
