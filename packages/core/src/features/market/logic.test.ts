import { describe, expect, it } from "vite-plus/test";

import {
  formatOfferingPrice,
  formatOfferingQuantity,
  formatOfferingTotal,
  formatVoucherRate,
} from "./logic";

describe("formatVoucherRate", () => {
  it("pairs a whole value with its unit of account", () => {
    expect(formatVoucherRate("10", "KSH")).toEqual({ value: "10", unit: "KSH" });
  });

  // `NUMERIC` casts to text with its stored scale, so a rate of one arrives as
  // "1.000000". "1 MALII = 1.000000 KSH" is noise, not precision.
  it("drops the scale Postgres pads a NUMERIC with", () => {
    expect(formatVoucherRate("1.000000", "KSH")?.value).toBe("1");
    expect(formatVoucherRate("10.50", "KES")?.value).toBe("10.5");
    expect(formatVoucherRate("0.500", "USD")?.value).toBe("0.5");
  });

  // Half a rate is not a rate. "1 MALII = 10" and "1 MALII = KSH" are both
  // worse than saying nothing, so either side missing suppresses the line.
  it.each([
    ["no value", null, "KSH"],
    ["no unit", "10", null],
    ["neither", null, null],
    ["blank value", "   ", "KSH"],
    ["blank unit", "10", "  "],
  ])("returns null with %s", (_label, value, unit) => {
    expect(formatVoucherRate(value, unit)).toBeNull();
  });

  // A rate is a claim about what a voucher is worth. Anything that is not a
  // plain non-negative decimal is suppressed rather than rendered as-is: this
  // string lands in the page unescaped-by-intent, and a stated rate the issuer
  // did not set is worse than a missing one.
  it.each([
    ["text", "ten"],
    ["a partial number", "10abc"],
    ["scientific notation", "1e3"],
    ["negative", "-10"],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
    ["a thousands separator", "1,000"],
    ["a stray sign", "+10"],
    ["a bare dot", "."],
    ["hex", "0x10"],
  ])("returns null for %s", (_label, value) => {
    expect(formatVoucherRate(value, "KSH")).toBeNull();
  });

  it("keeps a legitimate zero rate", () => {
    expect(formatVoucherRate("0", "KSH")).toEqual({ value: "0", unit: "KSH" });
  });

  // Never routed through Number: a value with more significant digits than a
  // double holds must reach the screen exactly as the issuer stored it.
  it("preserves precision a double would round", () => {
    expect(formatVoucherRate("9007199254740993.25", "KSH")?.value).toBe("9007199254740993.25");
  });

  // Unit of account is free text from the issuer — KSH, Ksh, usd, Hour all
  // occur in the catalog. Normalising it would misreport what they wrote.
  it("passes the unit through verbatim apart from surrounding space", () => {
    expect(formatVoucherRate("1", " Hours ")?.unit).toBe("Hours");
    expect(formatVoucherRate("1", "usd")?.unit).toBe("usd");
  });
});

describe("formatOfferingPrice", () => {
  it.each([null, "", "0", "0.00", "ten", "-1"])("treats %s as price on request", (price) => {
    expect(formatOfferingPrice(price)).toBeNull();
  });

  it("trims scale without rounding through a double", () => {
    expect(formatOfferingPrice("10.5000")).toEqual({ value: "10.5" });
    expect(formatOfferingPrice("9007199254740993.25")).toEqual({
      value: "9007199254740993.25",
    });
  });
});

describe("formatOfferingQuantity", () => {
  it.each([null, "", "0", "0.000", "many", "-1"])("omits %s", (quantity) => {
    expect(formatOfferingQuantity(quantity, "kg")).toBeNull();
  });

  it("keeps a positive quantity with an optional issuer-authored unit", () => {
    expect(formatOfferingQuantity("5.00", " kg ")).toEqual({ value: "5", unit: "kg" });
    expect(formatOfferingQuantity("1000000000", null)).toEqual({
      value: "1000000000",
      unit: null,
    });
  });
});

describe("formatOfferingTotal", () => {
  it("multiplies a whole price by the chosen quantity", () => {
    expect(formatOfferingTotal("100", 1)).toEqual({ value: "100" });
    expect(formatOfferingTotal("100", 2)).toEqual({ value: "200" });
    expect(formatOfferingTotal("100", 13)).toEqual({ value: "1300" });
  });

  // 0.1 + 0.1 + 0.1 is not 0.3 in binary floating point, and a total the buyer
  // cannot reproduce by hand is a total they cannot trust.
  it("multiplies decimals exactly rather than through a double", () => {
    expect(formatOfferingTotal("0.1", 3)).toEqual({ value: "0.3" });
    expect(formatOfferingTotal("1.15", 3)).toEqual({ value: "3.45" });
    expect(formatOfferingTotal("9007199254740993.25", 4)).toEqual({
      value: "36028797018963973",
    });
  });

  it("keeps a leading zero when the product is under one unit", () => {
    expect(formatOfferingTotal("0.25", 1)).toEqual({ value: "0.25" });
    expect(formatOfferingTotal("0.25", 2)).toEqual({ value: "0.5" });
  });

  // The stepper cannot produce these, but the total must not invent a number
  // if some future caller can.
  it.each([
    ["a price on request", null, 2],
    ["a zero price", "0", 2],
    ["a non-decimal price", "ten", 2],
    ["a zero quantity", "100", 0],
    ["a negative quantity", "100", -1],
    ["a fractional quantity", "100", 1.5],
  ])("returns null for %s", (_label, price, count) => {
    expect(formatOfferingTotal(price, count)).toBeNull();
  });
});
