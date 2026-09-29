import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_LOCALE, matchSupportedLocale } from "./locales";

describe("matchSupportedLocale", () => {
  it("strips the region subtag and honors preference order", () => {
    expect(matchSupportedLocale(["sw-KE", "en-US"])).toBe("sw");
  });

  it("matches a region-tagged default locale", () => {
    expect(matchSupportedLocale(["en-US"])).toBe("en");
  });

  it("matches Serbian region and script tags", () => {
    expect(matchSupportedLocale(["sr-RS"])).toBe("sr");
    expect(matchSupportedLocale(["sr-Cyrl-RS"])).toBe("sr");
  });

  it("matches generic and region-tagged Spanish locales", () => {
    expect(matchSupportedLocale(["es"])).toBe("es");
    expect(matchSupportedLocale(["es-ES"])).toBe("es");
    expect(matchSupportedLocale(["es-MX"])).toBe("es");
    expect(matchSupportedLocale(["es-CO"])).toBe("es");
    expect(matchSupportedLocale(["es_AR"])).toBe("es");
  });

  it("honors Spanish in the preferred-language order", () => {
    expect(matchSupportedLocale(["de-DE", "es-MX", "fr-FR"])).toBe("es");
  });

  it("matches generic and region-tagged French locales", () => {
    expect(matchSupportedLocale(["fr"])).toBe("fr");
    expect(matchSupportedLocale(["fr-FR"])).toBe("fr");
    expect(matchSupportedLocale(["fr-CD"])).toBe("fr");
    expect(matchSupportedLocale(["fr_CA"])).toBe("fr");
  });

  it("honors French in the preferred-language order", () => {
    expect(matchSupportedLocale(["de-DE", "fr-CA", "en-US"])).toBe("fr");
  });

  it("falls back to the default locale when nothing matches", () => {
    expect(matchSupportedLocale(["de", "pt"])).toBe(DEFAULT_LOCALE);
  });

  it("falls back to the default locale for an empty list", () => {
    expect(matchSupportedLocale([])).toBe(DEFAULT_LOCALE);
  });

  it("is case-insensitive", () => {
    expect(matchSupportedLocale(["SW"])).toBe("sw");
    expect(matchSupportedLocale(["ES-mx"])).toBe("es");
  });

  it("normalizes underscore-delimited tags (e.g. en_US)", () => {
    expect(matchSupportedLocale(["sw_KE", "en_US"])).toBe("sw");
  });

  it("trims surrounding whitespace", () => {
    expect(matchSupportedLocale(["  sw-KE  "])).toBe("sw");
  });
});
