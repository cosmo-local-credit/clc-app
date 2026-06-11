import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_LOCALE, matchSupportedLocale } from "./locales";

describe("matchSupportedLocale", () => {
  it("strips the region subtag and honors preference order", () => {
    expect(matchSupportedLocale(["sw-KE", "en-US"])).toBe("sw");
  });

  it("matches a region-tagged default locale", () => {
    expect(matchSupportedLocale(["en-US"])).toBe("en");
  });

  it("falls back to the default locale when nothing matches", () => {
    expect(matchSupportedLocale(["fr", "de"])).toBe(DEFAULT_LOCALE);
  });

  it("falls back to the default locale for an empty list", () => {
    expect(matchSupportedLocale([])).toBe(DEFAULT_LOCALE);
  });

  it("is case-insensitive", () => {
    expect(matchSupportedLocale(["SW"])).toBe("sw");
  });
});
