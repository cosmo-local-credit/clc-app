import { describe, expect, it } from "vite-plus/test";

import { formatVoucherRate } from "./logic";

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
