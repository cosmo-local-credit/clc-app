import { activateLocale, i18n } from "@clc/i18n/index";
import { msg } from "@lingui/core/macro";
import { afterEach, describe, expect, it } from "vite-plus/test";

function maxAmount(max: string): string {
  return i18n._(msg`Max ${max}`);
}

describe("i18n catalogs", () => {
  afterEach(async () => {
    await activateLocale("en");
  });

  it("activates the Kiswahili catalog on demand", async () => {
    await activateLocale("sw");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe("Chagua eneo");
  });

  it("activates the French catalog on demand", async () => {
    await activateLocale("fr");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "Choisissez un emplacement",
    );
    expect(i18n._(msg`Pools`)).toBe("Bassins");
    expect(i18n._(msg`Wallet`)).toBe("Portefeuille");
    expect(i18n._(msg`Swap`)).toBe("Échanger");
    expect(maxAmount("55,00")).toBe("Max 55,00");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 1 },
      }),
    ).toBe("1 bon d’échange");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 3 },
      }),
    ).toBe("3 bons d’échange");
  });

  it("activates the Spanish catalog on demand", async () => {
    await activateLocale("es");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "Elija una ubicación",
    );
    expect(i18n._(msg`Pools`)).toBe("Fondos");
    expect(i18n._(msg`Wallet`)).toBe("Billetera");
    expect(i18n._(msg`Swap`)).toBe("Intercambiar");
    expect(maxAmount("55,00")).toBe("Máx. 55,00");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 1 },
      }),
    ).toBe("1 vale");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 3 },
      }),
    ).toBe("3 vales");
  });

  it("activates the Portuguese catalog on demand", async () => {
    await activateLocale("pt");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "Escolha uma localização",
    );
    expect(i18n._(msg`Pools`)).toBe("Fundos");
    expect(i18n._(msg`Wallet`)).toBe("Carteira");
    expect(i18n._(msg`Swap`)).toBe("Trocar");
    expect(maxAmount("55,00")).toBe("Máx. 55,00");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 1 },
      }),
    ).toBe("1 vale");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 3 },
      }),
    ).toBe("3 vales");
  });

  it("activates the Italian catalog on demand", async () => {
    await activateLocale("it");

    expect(i18n.locales).toEqual(["it"]);
    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "Scelga una posizione",
    );
    expect(i18n._(msg`Pools`)).toBe("Fondi");
    expect(i18n._(msg`Wallet`)).toBe("Portafoglio");
    expect(i18n._(msg`Swap`)).toBe("Scambiare");
    expect(i18n._(msg`Redeem`)).toBe("Riscattare");
    expect(maxAmount("55,00")).toBe("Max 55,00");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 1 },
      }),
    ).toBe("1 buono");
    expect(
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count: 3 },
      }),
    ).toBe("3 buoni");
  });

  it("activates the Arabic catalog with Arabic-Indic formatting and all plural forms", async () => {
    await activateLocale("ar");

    expect(i18n.locales).toEqual(["ar-u-nu-arab"]);
    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe("اختر موقعًا");
    expect(i18n._(msg`Pools`)).toBe("الصناديق");
    expect(i18n._(msg`Wallet`)).toBe("المحفظة");
    expect(i18n._(msg`Swap`)).toBe("مبادلة");
    expect(i18n._(msg`Redeem`)).toBe("استرداد");

    const voucherCount = (count: number) =>
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count },
      });

    expect(voucherCount(0)).toBe("لا قسائم");
    expect(voucherCount(1)).toBe("قسيمة واحدة");
    expect(voucherCount(2)).toBe("قسيمتان");
    expect(voucherCount(3)).toBe("٣ قسائم");
    expect(voucherCount(11)).toBe("١١ قسيمة");
    expect(voucherCount(100)).toBe("١٠٠ قسيمة");
  });

  it("activates the Serbian Ijekavian catalog on demand", async () => {
    await activateLocale("sr");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "Изаберите локацију",
    );
    expect(i18n._(msg`Pools`)).toBe("Тржнице");
    expect(i18n._(msg`Notifications`)).toBe("Обавјештења");
    expect(i18n._(msg`Checking…`)).toBe("Провјера…");
    expect(i18n._(msg`Save changes`)).toBe("Сачувај измјене");
    expect(i18n._(msg`Switch wallet`)).toBe("Промијени новчаник");
  });

  it.each([
    ["ar", "فتح القائمة", "الانتقال إلى الموقع المحفوظ", "شروط الخدمة"],
    ["es", "Abrir menú", "Ir a la ubicación guardada", "Términos del servicio"],
    ["fr", "Ouvrir le menu", "Accéder à l’emplacement enregistré", "Conditions d’utilisation"],
    ["it", "Apra il menu", "Vada alla posizione salvata", "Termini di servizio"],
    ["pt", "Abrir menu", "Ir para a localização guardada", "Termos de Serviço"],
    ["sr", "Отвори мени", "Иди на сачувану локацију", "Услови коришћења"],
    ["sw", "Fungua menyu", "Nenda kwenye eneo lililohifadhiwa", "Masharti ya Huduma"],
  ] as const)("translates the reusable app menu into %s", async (locale, open, location, terms) => {
    await activateLocale(locale);

    expect(i18n._(msg`Open menu`)).toBe(open);
    expect(i18n._(msg`Go to saved location`)).toBe(location);
    expect(i18n._(msg`Terms of Service`)).toBe(terms);
  });

  it("falls back to English as the base locale", async () => {
    await activateLocale("en");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "Choose a location",
    );
  });
});
