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

  it("falls back to English as the base locale", async () => {
    await activateLocale("en");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe(
      "Choose a location",
    );
  });
});
