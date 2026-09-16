import { describe, expect, it } from "vite-plus/test";
import { voucherReceiptSearchSchema } from "./receipt-search";

describe("voucherReceiptSearchSchema", () => {
  it("keeps the mint amount whether the router parsed it as a string or a number", () => {
    expect(voucherReceiptSearchSchema.parse({ trackingId: "t-1", mintAmount: "2000" })).toEqual({
      trackingId: "t-1",
      mintAmount: "2000",
    });
    expect(voucherReceiptSearchSchema.parse({ trackingId: "t-1", mintAmount: 2000 })).toEqual({
      trackingId: "t-1",
      mintAmount: "2000",
    });
  });

  it("drops an amount that is not a positive decimal", () => {
    expect(voucherReceiptSearchSchema.parse({ mintAmount: "abc" }).mintAmount).toBeUndefined();
    expect(voucherReceiptSearchSchema.parse({ mintAmount: -5 }).mintAmount).toBeUndefined();
  });
});
