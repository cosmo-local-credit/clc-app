import { describe, expect, it } from "vite-plus/test";

import { formatPoolSwapFee } from "./pool-swap-fees";

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
});
