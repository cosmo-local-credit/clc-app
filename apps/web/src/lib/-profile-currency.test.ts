import { describe, expect, it } from "vite-plus/test";

import { preferredCurrencyForCountry, regionFromLocale } from "./profile-currency";

describe("preferredCurrencyForCountry", () => {
  it.each([
    ["KE", "KES"],
    ["tz", "TZS"],
    ["UG", "UGX"],
    ["RS", "RSD"],
    ["DE", "EUR"],
    ["unknown", "USD"],
  ])("suggests %s as %s", (country, currency) => {
    expect(preferredCurrencyForCountry(country)).toBe(currency);
  });
});

describe("regionFromLocale", () => {
  it("uses the first locale that names a region", () => {
    expect(regionFromLocale(["sw", "en-KE"])).toBe("KE");
  });

  it("ignores malformed locale entries", () => {
    expect(regionFromLocale(["not a locale", "sr-RS"])).toBe("RS");
  });
});
