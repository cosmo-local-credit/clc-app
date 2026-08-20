import { activateLocale, i18n } from "@clc/i18n/index";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { translateValidationError } from "./validation-i18n";

const knownErrors = [
  "Name is required",
  "Name must be 80 characters or fewer",
  "Invalid email address",
  "Invalid phone number",
  "Provide an email or phone number",
  "Choose a location",
  "Invalid location",
  "Voucher name is required",
  "Voucher name must be 80 characters or fewer",
  "Voucher symbol is required",
  "Voucher symbol must be 6 characters or fewer",
  "Use only letters and numbers for the voucher symbol",
  "Price must be greater than zero",
  "Voucher description is required",
  "Voucher description must be 500 characters or fewer",
  "Decimals must be a whole number from 0 to 18",
  "Choose an expiration date",
  "Expiration date must be in the future",
  "Accept the terms to publish your voucher",
  "Accept the PATH License to publish your voucher",
  "Pool name is required",
  "Pool name must be 80 characters or fewer",
  "Pool shortcode is required",
  "Pool shortcode must be 6 characters or fewer",
  "Use only letters and numbers for the pool shortcode",
  "Pool description is required",
  "Pool description must be 500 characters or fewer",
  "Swap fee must be a number from 0 to 100",
  "Accept the terms to publish your pool",
  "Accept the SPROUT License to publish your pool",
  "Choose rates you set or equal value when the unit has no price feed",
  "Message must be 500 characters or fewer",
  "Add a message or choose profile details",
] as const;

describe("translateValidationError", () => {
  afterEach(async () => {
    await activateLocale("en");
  });

  it("translates known validation errors with the active catalog", async () => {
    await activateLocale("sw");

    expect(translateValidationError("Choose a location", i18n)).toBe("Chagua eneo");
    expect(translateValidationError("Invalid phone number", i18n)).toBe(
      "Nambari ya simu si sahihi",
    );
    expect(translateValidationError("Choose an expiration date", i18n)).toBe(
      "Chagua tarehe ya mwisho wa matumizi",
    );
    expect(translateValidationError("Pool name is required", i18n)).toBe(
      "Jina la puli linahitajika",
    );
    expect(translateValidationError("Accept the SPROUT License to publish your pool", i18n)).toBe(
      "Kubali Leseni ya SPROUT ili kuchapisha puli yako",
    );
  });

  it("translates known validation errors into Serbian", async () => {
    await activateLocale("sr");

    expect(translateValidationError("Choose a location", i18n)).toBe("Изаберите локацију");
    expect(translateValidationError("Invalid phone number", i18n)).toBe("Неисправан број телефона");
    expect(translateValidationError("Accept the terms to publish your voucher", i18n)).toBe(
      "Прихватите услове да бисте објавили ваучер",
    );
    expect(translateValidationError("Pool name is required", i18n)).toBe("Назив пула је обавезан");
    expect(translateValidationError("Accept the SPROUT License to publish your pool", i18n)).toBe(
      "Прихватите SPROUT лиценцу да бисте објавили пул",
    );
  });

  it("keeps every known validation error wired to a translated catalog message", async () => {
    await activateLocale("sr");

    for (const error of knownErrors) {
      expect(translateValidationError(error, i18n)).not.toBe(error);
    }
  });

  it("returns unknown errors unchanged", async () => {
    await activateLocale("sw");

    expect(translateValidationError("Server rejected signup", i18n)).toBe("Server rejected signup");
  });
});
