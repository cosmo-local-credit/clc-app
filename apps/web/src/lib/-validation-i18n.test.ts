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
  "Voucher value must be greater than zero",
  "Voucher description is required",
  "Voucher description must be 500 characters or fewer",
  "Decimals must be a whole number from 0 to 18",
  "Choose an expiration date",
  "Expiration date must be in the future",
  "Accept the terms to publish your voucher",
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
  });

  it("translates known validation errors into Serbian", async () => {
    await activateLocale("sr");

    expect(translateValidationError("Choose a location", i18n)).toBe("Изаберите локацију");
    expect(translateValidationError("Invalid phone number", i18n)).toBe("Неисправан број телефона");
    expect(translateValidationError("Accept the terms to publish your voucher", i18n)).toBe(
      "Прихватите услове да бисте објавили ваучер",
    );
  });

  it("keeps every known validation error wired to a catalog message", async () => {
    await activateLocale("en");

    for (const error of knownErrors) {
      expect(translateValidationError(error, i18n)).toBe(error);
    }
  });

  it("returns unknown errors unchanged", async () => {
    await activateLocale("sw");

    expect(translateValidationError("Server rejected signup", i18n)).toBe("Server rejected signup");
  });
});
