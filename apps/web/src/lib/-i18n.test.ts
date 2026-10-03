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

  it("resolves the reported review IDs without development message fallbacks", async () => {
    await activateLocale("en");
    expect(i18n._({ id: "MUtNry", values: { 0: 0 } })).toBe("0 reviews");
    expect(i18n._("hgG8Pq")).toBe("Redeem this voucher to leave a review within seven days.");
    expect(i18n._("Pv07Of")).toBe("All reviews · newest first");
    expect(i18n._("dEETgs")).toBe("No reviews yet.");
  });

  it.each([
    ["ar", "لا توجد مراجعات بعد."],
    ["dz", "ད་ཚུན་བསྐྱར་ཞིབ་མེད།"],
    ["en", "No reviews yet."],
    ["es", "Aún no hay reseñas."],
    ["fr", "Aucun avis pour le moment."],
    ["it", "Non ci sono ancora recensioni."],
    ["pt", "Ainda não há avaliações."],
    ["sr", "Још нема рецензија."],
    ["sw", "Bado hakuna maoni."],
    ["uk", "Відгуків ще немає."],
  ] as const)("loads the review empty state in %s", async (locale, emptyMessage) => {
    await activateLocale(locale);
    expect(i18n._("dEETgs")).toBe(emptyMessage);
    for (const id of ["MUtNry", "hgG8Pq", "Pv07Of"]) {
      expect(i18n._({ id, values: { 0: 0 } })).not.toBe(id);
    }
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

  it("activates the Dzongkha catalog with Tibetan formatting and its single plural form", async () => {
    await activateLocale("dz");

    expect(i18n.locales).toEqual(["dz"]);
    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "ས་གནས་ཅིག་གདམ་ཁ་རྐྱབ།",
    );
    expect(i18n._(msg`Pools`)).toBe("མཉམ་སྤྱོད་དངུལ་ཁུངས་ཚུ།");
    expect(i18n._(msg`Wallet`)).toBe("དངུལ་ཁུག");
    expect(i18n._(msg`Swap`)).toBe("བརྗེ་ལེན།");
    expect(i18n._(msg`Redeem`)).toBe("བསྐྱར་ཉོ།");
    expect(i18n._(msg`Open menu`)).toBe("དཀར་ཆག་ཁ་ཕྱེ།");
    expect(i18n._(msg`Terms of Service`)).toBe("ཞབས་ཏོག་གི་ཁ་ཚིག");

    const pluralMessages = [
      {
        message: "{count, plural, one {# pool} other {# pools}}",
        variable: "count",
        noun: "མཉམ་སྤྱོད་དངུལ་ཁུངས",
      },
      {
        message: "{requested, plural, one {# filter} other {# filters}}",
        variable: "requested",
        noun: "ཚགས་མ",
      },
      {
        message: "{count, plural, one {# tag} other {# tags}}",
        variable: "count",
        noun: "ངོ་རྟགས",
      },
      {
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        variable: "count",
        noun: "འཛིན་ཤོག",
      },
      {
        message: "{count, plural, one {# post} other {# posts}}",
        variable: "count",
        noun: "གསལ་བསྒྲགས",
      },
    ] as const;

    for (const { message, variable, noun } of pluralMessages) {
      for (const count of [0, 1, 2, 3, 11, 100]) {
        const localizedCount = new Intl.NumberFormat("dz").format(count);
        expect(i18n._({ id: message, message, values: { [variable]: count } })).toBe(
          `${localizedCount} ${noun}`,
        );
      }
    }
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

  it("activates the Ukrainian catalog with all plural forms", async () => {
    await activateLocale("uk");

    expect(i18n.locales).toEqual(["uk"]);
    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe("Оберіть місце");
    expect(i18n._(msg`Pools`)).toBe("Пули");
    expect(i18n._(msg`Wallet`)).toBe("Гаманець");
    expect(i18n._(msg`Swap`)).toBe("Обміняти");
    expect(i18n._(msg`Redeem`)).toBe("Погасити");
    expect(maxAmount("55,00")).toBe("Макс. 55,00");

    const voucherCount = (count: number) =>
      i18n._({
        id: "{count, plural, one {# voucher} other {# vouchers}}",
        message: "{count, plural, one {# voucher} other {# vouchers}}",
        values: { count },
      });

    expect(voucherCount(0)).toBe("0 ваучерів");
    expect(voucherCount(1)).toBe("1 ваучер");
    expect(voucherCount(2)).toBe("2 ваучери");
    expect(voucherCount(5)).toBe("5 ваучерів");
    expect(voucherCount(21)).toBe("21 ваучер");
    expect(voucherCount(22)).toBe("22 ваучери");
    expect(voucherCount(25)).toBe("25 ваучерів");
    expect(voucherCount(1.5)).toBe("1,5 ваучера");
  });

  it.each([
    ["ar", "فتح القائمة", "الانتقال إلى الموقع المحفوظ", "شروط الخدمة"],
    ["es", "Abrir menú", "Ir a la ubicación guardada", "Términos del servicio"],
    ["fr", "Ouvrir le menu", "Accéder à l’emplacement enregistré", "Conditions d’utilisation"],
    ["it", "Apra il menu", "Vada alla posizione salvata", "Termini di servizio"],
    ["pt", "Abrir menu", "Ir para a localização guardada", "Termos de Serviço"],
    ["sr", "Отвори мени", "Иди на сачувану локацију", "Услови коришћења"],
    ["sw", "Fungua menyu", "Nenda kwenye eneo lililohifadhiwa", "Masharti ya Huduma"],
    ["uk", "Відкрити меню", "Перейти до збереженого місця", "Умови користування"],
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
