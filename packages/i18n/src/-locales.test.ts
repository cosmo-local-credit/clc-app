import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_LOCALE,
  getLocaleDirection,
  getLocaleFormattingLocale,
  matchSupportedLocale,
} from "./locales";

describe("matchSupportedLocale", () => {
  it("strips the region subtag and honors preference order", () => {
    expect(matchSupportedLocale(["sw-KE", "en-US"])).toBe("sw");
  });

  it("matches a region-tagged default locale", () => {
    expect(matchSupportedLocale(["en-US"])).toBe("en");
  });

  it("matches generic and region-tagged Arabic locales", () => {
    expect(matchSupportedLocale(["ar"])).toBe("ar");
    expect(matchSupportedLocale(["ar-EG"])).toBe("ar");
    expect(matchSupportedLocale(["ar-SA"])).toBe("ar");
    expect(matchSupportedLocale(["ar-Arab-EG"])).toBe("ar");
    expect(matchSupportedLocale(["ar-MA"])).toBe("ar");
    expect(matchSupportedLocale(["ar_AE"])).toBe("ar");
  });

  it("honors Arabic in the preferred-language order", () => {
    expect(matchSupportedLocale(["de-DE", "ar-EG", "fr-FR"])).toBe("ar");
  });

  it("exposes Arabic direction and numbering metadata", () => {
    expect(getLocaleDirection("ar")).toBe("rtl");
    expect(getLocaleDirection("en")).toBe("ltr");
    expect(getLocaleFormattingLocale("ar")).toBe("ar-u-nu-arab");
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

  it("matches generic and region-tagged Italian locales", () => {
    expect(matchSupportedLocale(["it"])).toBe("it");
    expect(matchSupportedLocale(["it-IT"])).toBe("it");
    expect(matchSupportedLocale(["it-CH"])).toBe("it");
    expect(matchSupportedLocale(["it-SM"])).toBe("it");
    expect(matchSupportedLocale(["it_VA"])).toBe("it");
  });

  it("honors Italian in the preferred-language order", () => {
    expect(matchSupportedLocale(["de-DE", "it-CH", "fr-FR"])).toBe("it");
  });

  it("matches generic and region-tagged Portuguese locales", () => {
    expect(matchSupportedLocale(["pt"])).toBe("pt");
    expect(matchSupportedLocale(["pt-BR"])).toBe("pt");
    expect(matchSupportedLocale(["pt-PT"])).toBe("pt");
    expect(matchSupportedLocale(["pt-AO"])).toBe("pt");
    expect(matchSupportedLocale(["pt-MZ"])).toBe("pt");
    expect(matchSupportedLocale(["pt_CV"])).toBe("pt");
  });

  it("honors Portuguese in the preferred-language order", () => {
    expect(matchSupportedLocale(["de-DE", "pt-AO", "es-ES"])).toBe("pt");
  });

  it("falls back to the default locale when nothing matches", () => {
    expect(matchSupportedLocale(["de", "ja"])).toBe(DEFAULT_LOCALE);
  });

  it("falls back to the default locale for an empty list", () => {
    expect(matchSupportedLocale([])).toBe(DEFAULT_LOCALE);
  });

  it("is case-insensitive", () => {
    expect(matchSupportedLocale(["AR-eg"])).toBe("ar");
    expect(matchSupportedLocale(["SW"])).toBe("sw");
    expect(matchSupportedLocale(["ES-mx"])).toBe("es");
    expect(matchSupportedLocale(["IT-ch"])).toBe("it");
    expect(matchSupportedLocale(["PT-br"])).toBe("pt");
  });

  it("normalizes underscore-delimited tags (e.g. en_US)", () => {
    expect(matchSupportedLocale(["sw_KE", "en_US"])).toBe("sw");
  });

  it("trims surrounding whitespace", () => {
    expect(matchSupportedLocale(["  sw-KE  "])).toBe("sw");
  });
});
