import { activateLocale, i18n } from "@clc/i18n/index";
import { msg } from "@lingui/core/macro";
import { afterEach, describe, expect, it } from "vite-plus/test";

describe("i18n catalogs", () => {
  afterEach(async () => {
    await activateLocale("en");
  });

  it("activates the Kiswahili catalog on demand", async () => {
    await activateLocale("sw");

    expect(i18n._({ id: "Choose a location", message: "Choose a location" })).toBe("Chagua eneo");
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
