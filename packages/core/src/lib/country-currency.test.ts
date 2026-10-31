import { describe, expect, it } from "vite-plus/test";

import { CURRENCY_BY_COUNTRY, preferredCurrencyForCountry } from "./country-currency";
import { isIsoCurrency } from "./currencies";

describe("preferredCurrencyForCountry", () => {
  it.each([
    ["IN", "INR"],
    ["in", "INR"],
    [" BT ", "BTN"],
    ["NP", "NPR"],
    ["JP", "JPY"],
    ["CN", "CNY"],
    ["BR", "BRL"],
    ["KE", "KES"],
    ["tz", "TZS"],
    ["DE", "EUR"],
    ["BG", "EUR"],
    ["LS", "ZAR"],
    ["PA", "PAB"],
    ["EC", "USD"],
  ])("suggests %s as %s", (country, currency) => {
    expect(preferredCurrencyForCountry(country)).toBe(currency);
  });

  it.each([undefined, null, "", "unknown", "AQ", "CW", "SX", "ZW"])(
    "falls back to USD for %s",
    (country) => {
      expect(preferredCurrencyForCountry(country)).toBe("USD");
    },
  );

  it("covers every region whose current tender the picker offers", () => {
    // CLDR 49 regions with a current tender present in ISO_CURRENCIES.
    expect(Object.keys(CURRENCY_BY_COUNTRY)).toHaveLength(253);
    for (const [country, currency] of Object.entries(CURRENCY_BY_COUNTRY)) {
      expect(isIsoCurrency(currency), country).toBe(true);
      expect(preferredCurrencyForCountry(country)).toBe(currency);
    }
  });
});
