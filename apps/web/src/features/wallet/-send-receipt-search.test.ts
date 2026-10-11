import { describe, expect, it } from "vite-plus/test";

import { sendReceiptSearchSchema } from "./send-receipt-search";

describe("sendReceiptSearchSchema", () => {
  it("keeps a complete exact valuation snapshot", () => {
    expect(
      sendReceiptSearchSchema.parse({
        trackingId: "tracking-1",
        amount: "10",
        symbol: "XYZ",
        uoaValue: "12.5000",
        uoa: " KES ",
        uoaUnavailable: true,
      }),
    ).toMatchObject({
      trackingId: "tracking-1",
      amount: "10",
      symbol: "XYZ",
      uoaValue: "12.5000",
      uoa: "KES",
      uoaUnavailable: undefined,
    });
  });

  it("ignores incomplete or malformed valuation parameters", () => {
    expect(sendReceiptSearchSchema.parse({ uoaValue: "1.5", uoa: "KES and USD" })).toMatchObject({
      uoaValue: undefined,
      uoa: undefined,
      uoaUnavailable: undefined,
    });
    expect(sendReceiptSearchSchema.parse({ uoaValue: "1e6", uoa: "KES" })).toMatchObject({
      uoaValue: undefined,
      uoa: undefined,
      uoaUnavailable: undefined,
    });
  });

  it("retains an explicit unavailable snapshot and accepts legacy receipts", () => {
    expect(sendReceiptSearchSchema.parse({ uoaUnavailable: true })).toMatchObject({
      uoaValue: undefined,
      uoa: undefined,
      uoaUnavailable: true,
    });
    expect(sendReceiptSearchSchema.parse({ trackingId: "legacy" })).toMatchObject({
      trackingId: "legacy",
      uoaValue: undefined,
      uoa: undefined,
      uoaUnavailable: undefined,
    });
  });
});
