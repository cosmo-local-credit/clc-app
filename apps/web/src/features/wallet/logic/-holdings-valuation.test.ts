import { describe, expect, it } from "vite-plus/test";

import {
  nativeHoldingValue,
  valueHolding,
  walletTotal,
  walletValuationUnit,
} from "./holdings-valuation";

describe("nativeHoldingValue", () => {
  it("states a voucher in its own unit at its issuer's rate", () => {
    expect(nativeHoldingValue("15.3", false, { value: "10", unit: "KES" })).toEqual({
      value: "153",
      unit: "KES",
    });
    expect(nativeHoldingValue("0.5", false, { value: "5", unit: "Hours" })).toEqual({
      value: "2.5",
      unit: "Hours",
    });
  });

  it("counts a stable as US dollars", () => {
    expect(nativeHoldingValue("12.5", true, null)).toEqual({ value: "12.5", unit: "USD" });
  });

  it("has no value without a usable rate", () => {
    expect(nativeHoldingValue("10", false, null)).toBeNull();
    expect(nativeHoldingValue("10", false, { value: null, unit: null })).toBeNull();
    expect(nativeHoldingValue("10", false, { value: "0", unit: "KES" })).toBeNull();
    expect(nativeHoldingValue("10", false, { value: "10", unit: "" })).toBeNull();
  });
});

describe("valueHolding", () => {
  it("values a voucher at its issuer's rate in the same unit", () => {
    expect(
      valueHolding(
        { amount: "3200", stable: false, rate: { value: "1", unit: "KES" } },
        "KES",
        null,
      ),
    ).toEqual({ status: "priced", value: "3200" });
    expect(
      valueHolding(
        { amount: "2.5", stable: false, rate: { value: "40", unit: "kes" } },
        "KES",
        null,
      ),
    ).toEqual({ status: "priced", value: "100" });
  });

  it("leaves a voucher in another unit unpriced rather than summing unlike units", () => {
    expect(
      valueHolding(
        { amount: "10", stable: false, rate: { value: "1", unit: "Hour" } },
        "KES",
        null,
      ),
    ).toEqual({ status: "unpriced" });
    expect(
      valueHolding({ amount: "10", stable: false, rate: { value: null, unit: null } }, "KES", null),
    ).toEqual({ status: "unpriced" });
    expect(valueHolding({ amount: "10", stable: false, rate: null }, "KES", null)).toEqual({
      status: "unpriced",
    });
  });

  it("waits for the voucher record and the cash-out rate", () => {
    expect(valueHolding({ amount: "1", stable: false, rate: undefined }, "KES", null)).toEqual({
      status: "pending",
    });
    expect(
      valueHolding({ amount: "1", stable: true, rate: null }, "KES", {
        unit: "KES",
        value: undefined,
      }),
    ).toEqual({ status: "pending" });
  });

  it("converts dollars into the cash-out currency at the cash-out rate", () => {
    expect(
      valueHolding({ amount: "42.1", stable: true, rate: null }, "KES", {
        unit: "KES",
        value: "129",
      }),
    ).toEqual({ status: "priced", value: "5430.9" });
    expect(valueHolding({ amount: "42.1", stable: true, rate: null }, "USD", null)).toEqual({
      status: "priced",
      value: "42.1",
    });
    expect(
      valueHolding({ amount: "42.1", stable: true, rate: null }, "KES", {
        unit: "KES",
        value: null,
      }),
    ).toEqual({ status: "unpriced" });
  });
});

describe("walletValuationUnit", () => {
  it("prefers the profile currency and otherwise the commonest voucher unit", () => {
    expect(walletValuationUnit("kes", ["USD"])).toBe("KES");
    expect(walletValuationUnit(null, ["USD", "KES", "kes", null])).toBe("KES");
    expect(walletValuationUnit(undefined, [])).toBeNull();
  });
});

describe("walletTotal", () => {
  it("sums priced holdings exactly and counts the unpriced", () => {
    expect(
      walletTotal([
        { status: "priced", value: "3200" },
        { status: "priced", value: "2150.5" },
        { status: "unpriced" },
      ]),
    ).toEqual({ status: "ready", total: "5350.5", unpriced: 1 });
    expect(walletTotal([{ status: "pending" }]).status).toBe("pending");
  });
});
