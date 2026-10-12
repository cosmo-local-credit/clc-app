import { describe, expect, it } from "vite-plus/test";
import { swapReceiptSearchSchema } from "./swap-receipt-search";

describe("swapReceiptSearchSchema", () => {
  it("keeps complete submission-time values for both voucher legs", () => {
    expect(
      swapReceiptSearchSchema.parse({
        sendUoaValue: "12.5",
        sendUoa: "KES",
        receiveUoaValue: "9.25",
        receiveUoa: "USD",
      }),
    ).toMatchObject({
      sendUoaValue: "12.5",
      sendUoa: "KES",
      sendUoaUnavailable: undefined,
      receiveUoaValue: "9.25",
      receiveUoa: "USD",
      receiveUoaUnavailable: undefined,
    });
  });

  it("marks an incomplete leg unavailable without borrowing current metadata", () => {
    expect(
      swapReceiptSearchSchema.parse({ sendUoaValue: "12.5", receiveUoa: "USD" }),
    ).toMatchObject({
      sendUoaValue: undefined,
      sendUoa: undefined,
      sendUoaUnavailable: true,
      receiveUoaValue: undefined,
      receiveUoa: undefined,
      receiveUoaUnavailable: true,
    });
  });
});
