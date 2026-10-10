import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { activateLocale, i18n } from "@clc/i18n/index";
import { msg } from "@lingui/core/macro";
import { afterEach, describe, expect, it } from "vite-plus/test";

/**
 * The complete unit-bearing message goes through Lingui so a translator can
 * reorder value and unit. Concatenating a translated unit fragment onto a
 * number would make that impossible — Swahili puts the unit first.
 */
// A member expression, matching `market-page.tsx` exactly, so lingui derives
// the same `{0} m` / `{0} km` message ids these catalogs actually carry. A
// bare identifier would generate `{value} m` and silently miss the catalog.
function metres(distance: { value: number }): string {
  const localized = {
    value: new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale).format(distance.value),
  };
  return i18n._(msg`${localized.value} m`);
}

function kilometres(distance: { value: string }): string {
  return i18n._(msg`${distance.value} km`);
}

afterEach(async () => {
  await activateLocale("en");
});

describe("translated distance labels", () => {
  it("renders English with the unit after the number", async () => {
    await activateLocale("en");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12.4" })).toBe("12.4 km");
  });

  it("renders Arabic with Arabic-Indic digits and the translated unit", async () => {
    await activateLocale("ar");

    expect(metres({ value: 300 })).toBe("٣٠٠ م");
    expect(kilometres({ value: "١٢٫٤" })).toBe("١٢٫٤ كم");
  });

  it("renders Dzongkha with Tibetan digits and the translated unit", async () => {
    await activateLocale("dz");

    expect(metres({ value: 300 })).toBe("མི་ཊར་ ༣༠༠");
    expect(kilometres({ value: "༡༢.༤" })).toBe("ཀི་ལོ་མི་ཊར་ ༡༢.༤");
  });

  it("renders German", async () => {
    await activateLocale("de");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12,4" })).toBe("12,4 km");
  });

  it("renders Spanish", async () => {
    await activateLocale("es");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12,4" })).toBe("12,4 km");
  });

  it("renders Filipino", async () => {
    await activateLocale("fil");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12.4" })).toBe("12.4 km");
  });

  it("renders Serbian", async () => {
    await activateLocale("sr");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12.4" })).toBe("12.4 km");
  });

  it("renders French", async () => {
    await activateLocale("fr");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12,4" })).toBe("12,4 km");
  });

  it("renders Portuguese", async () => {
    await activateLocale("pt");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12,4" })).toBe("12,4 km");
  });

  it("renders Italian", async () => {
    await activateLocale("it");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12,4" })).toBe("12,4 km");
  });

  it("renders Hindi with Latin digits and translated units", async () => {
    await activateLocale("hi");

    expect(metres({ value: 300 })).toBe("300 मी");
    expect(kilometres({ value: "12.4" })).toBe("12.4 किमी");
  });

  it("renders Simplified Chinese with Latin digits and translated units", async () => {
    await activateLocale("zh");

    expect(metres({ value: 300 })).toBe("300 米");
    expect(kilometres({ value: "12.4" })).toBe("12.4 公里");
  });

  it("renders Traditional Chinese with Latin digits and translated units", async () => {
    await activateLocale("zh-Hant");

    expect(metres({ value: 300 })).toBe("300 米");
    expect(kilometres({ value: "12.4" })).toBe("12.4 公里");
  });

  it("renders Dutch", async () => {
    await activateLocale("nl");

    expect(metres({ value: 300 })).toBe("300 m");
    expect(kilometres({ value: "12,4" })).toBe("12,4 km");
  });

  it("renders Ukrainian", async () => {
    await activateLocale("uk");

    expect(metres({ value: 300 })).toBe("300 м");
    expect(kilometres({ value: "12,4" })).toBe("12,4 км");
  });

  it("renders Swahili with the unit before the number", async () => {
    await activateLocale("sw");

    // This ordering is exactly why the whole message is translated: a
    // concatenated `${value} + t\`m\`` could never produce it.
    expect(metres({ value: 300 })).toBe("m 300");
    expect(kilometres({ value: "12.4" })).toBe("km 12.4");
  });

  it("feeds the core quantizer's output through the catalogs", async () => {
    const nairobi = { lat: -1.2921, lng: 36.8219 };
    const mombasa = { lat: -4.0435, lng: 39.6682 };
    const distance = formatDistance(haversineMeters(nairobi, mombasa));

    expect(distance.unit).toBe("km");
    expect(distance.fractionDigits).toBe(0);

    await activateLocale("sw");
    expect(kilometres({ value: distance.value.toFixed(distance.fractionDigits) })).toBe("km 440");
  });

  it("keeps every locale's kind labels translated", async () => {
    await activateLocale("dz");
    expect(i18n._(msg`Goods`)).toBe("ཅ་དངོས།");
    expect(i18n._(msg`Services`)).toBe("ཞབས་ཏོག་ཚུ།");
    expect(i18n._(msg`Voucher`)).toBe("འཛིན་ཤོག");

    await activateLocale("de");
    expect(i18n._(msg`Goods`)).toBe("Waren");
    expect(i18n._(msg`Services`)).toBe("Dienstleistungen");
    expect(i18n._(msg`Voucher`)).toBe("Gutschein");

    await activateLocale("es");
    expect(i18n._(msg`Goods`)).toBe("Bienes");
    expect(i18n._(msg`Services`)).toBe("Servicios");
    expect(i18n._(msg`Voucher`)).toBe("Vale");

    await activateLocale("fr");
    expect(i18n._(msg`Goods`)).toBe("Biens");
    expect(i18n._(msg`Services`)).toBe("Services");
    expect(i18n._(msg`Voucher`)).toBe("Bon d’échange");

    await activateLocale("fil");
    expect(i18n._(msg`Goods`)).toBe("Mga produkto");
    expect(i18n._(msg`Services`)).toBe("Mga serbisyo");
    expect(i18n._(msg`Voucher`)).toBe("Voucher");

    await activateLocale("hi");
    expect(i18n._(msg`Goods`)).toBe("माल");
    expect(i18n._(msg`Services`)).toBe("सेवाएँ");
    expect(i18n._(msg`Voucher`)).toBe("वाउचर");

    await activateLocale("pt");
    expect(i18n._(msg`Goods`)).toBe("Bens");
    expect(i18n._(msg`Services`)).toBe("Serviços");
    expect(i18n._(msg`Voucher`)).toBe("Vale");

    await activateLocale("it");
    expect(i18n._(msg`Goods`)).toBe("Beni");
    expect(i18n._(msg`Services`)).toBe("Servizi");
    expect(i18n._(msg`Voucher`)).toBe("Buono");

    await activateLocale("nl");
    expect(i18n._(msg`Goods`)).toBe("Goederen");
    expect(i18n._(msg`Services`)).toBe("Diensten");
    expect(i18n._(msg`Voucher`)).toBe("Waardebon");

    await activateLocale("sw");
    expect(i18n._(msg`Goods`)).toBe("Bidhaa");
    expect(i18n._(msg`Services`)).toBe("Huduma");
    expect(i18n._(msg`Voucher`)).toBe("Vocha");

    await activateLocale("sr");
    expect(i18n._(msg`Goods`)).toBe("Роба");
    expect(i18n._(msg`Services`)).toBe("Услуге");
    expect(i18n._(msg`Voucher`)).toBe("Ваучер");

    await activateLocale("zh");
    expect(i18n._(msg`Goods`)).toBe("商品");
    expect(i18n._(msg`Services`)).toBe("服务");
    expect(i18n._(msg`Voucher`)).toBe("代金券");

    await activateLocale("zh-Hant");
    expect(i18n._(msg`Goods`)).toBe("商品");
    expect(i18n._(msg`Services`)).toBe("服務");
    expect(i18n._(msg`Voucher`)).toBe("代金券");

    await activateLocale("uk");
    expect(i18n._(msg`Goods`)).toBe("Товари");
    expect(i18n._(msg`Services`)).toBe("Послуги");
    expect(i18n._(msg`Voucher`)).toBe("Ваучер");
  });

  it("translates the market load error, retry, and empty states", async () => {
    for (const locale of [
      "ar",
      "de",
      "dz",
      "es",
      "fil",
      "fr",
      "hi",
      "it",
      "nl",
      "pt",
      "sr",
      "sw",
      "uk",
      "zh",
      "zh-Hant",
    ] as const) {
      await activateLocale(locale);
      for (const message of [
        msg`Could not load vouchers.`,
        msg`Retry`,
        msg`No vouchers to show yet.`,
        msg`The map is not supported on this device.`,
      ]) {
        const translated = i18n._(message);
        expect(translated).not.toBe("");
        // An untranslated entry falls back to the English source text.
        expect(translated).not.toBe(message.message);
      }
    }
  });
});
