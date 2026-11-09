import { describe, expect, it } from "vite-plus/test";

import { checkSendAmount, sanitizeSendAmount, seededRecipientContext } from "./send-amount";

const POOL = "0x2b4F29a8438cc9c644F6Cf1E9C287fF2fe84674e";
const OTHER = "0x9c0F3a1B5d6e7F8091a2B3c4D5e6F708192a3b4C";

describe("sanitizeSendAmount", () => {
  it("keeps digits and one decimal point, two places at most", () => {
    expect(sanitizeSendAmount("6.6666")).toBe("6.66");
    expect(sanitizeSendAmount("1.2.3")).toBe("1.23");
    expect(sanitizeSendAmount("KES 1,250")).toBe("1250");
    expect(sanitizeSendAmount(".5")).toBe(".5");
    expect(sanitizeSendAmount("")).toBe("");
  });
});

describe("checkSendAmount", () => {
  it("accepts a positive amount within the raw balance", () => {
    expect(
      checkSendAmount({ amount: "5", amountRaw: "500", balanceRaw: "1000", displayBalance: "10" }),
    ).toEqual({ valid: true, exceedsBalance: false });
  });

  it("flags an amount over the raw balance", () => {
    expect(
      checkSendAmount({
        amount: "11",
        amountRaw: "1100",
        balanceRaw: "1000",
        displayBalance: "10",
      }),
    ).toEqual({ valid: true, exceedsBalance: true });
  });

  it("rejects a blank, zero or unparsable amount", () => {
    for (const [amount, amountRaw] of [
      ["", null],
      ["0", "0"],
      ["0.00", "0"],
      [".", null],
    ] as const) {
      expect(
        checkSendAmount({ amount, amountRaw, balanceRaw: "1000", displayBalance: "10" }).valid,
      ).toBe(false);
    }
  });

  it("falls back to the displayed balance while the raw one is unknown", () => {
    expect(
      checkSendAmount({
        amount: "1500",
        amountRaw: "150000",
        balanceRaw: null,
        displayBalance: "1,234.50",
      }),
    ).toEqual({ valid: true, exceedsBalance: true });
  });

  it("never exceeds with no voucher selected", () => {
    expect(
      checkSendAmount({
        amount: "5",
        amountRaw: null,
        balanceRaw: null,
        displayBalance: undefined,
      }),
    ).toEqual({ valid: false, exceedsBalance: false });
  });
});

describe("seededRecipientContext", () => {
  const seed = { recipient: POOL, recipientLabel: "Trade Pool", returnPool: POOL };

  it("keeps the link's label and pool for the recipient it named", () => {
    expect(seededRecipientContext({ address: POOL, name: null }, seed)).toEqual({
      recipientLabel: "Trade Pool",
      returnPool: POOL,
    });
  });

  it("prefers the recipient's own name", () => {
    expect(seededRecipientContext({ address: POOL, name: "Maria" }, seed).recipientLabel).toBe(
      "Maria",
    );
  });

  it("drops both once someone else is paid", () => {
    expect(seededRecipientContext({ address: OTHER, name: null }, seed)).toEqual({
      recipientLabel: undefined,
      returnPool: undefined,
    });
    expect(seededRecipientContext(null, seed)).toEqual({
      recipientLabel: undefined,
      returnPool: undefined,
    });
  });
});
