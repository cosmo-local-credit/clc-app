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
  "Choose a preferred currency",
  "Bio must be 500 characters or fewer",
  "Enter a valid website URL including https://",
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
  "Pool name is required",
  "Pool name must be 80 characters or fewer",
  "Pool shortcode is required",
  "Pool shortcode must be 6 characters or fewer",
  "Use only letters and numbers for the pool shortcode",
  "Pool description is required",
  "Pool description must be 500 characters or fewer",
  "Swap fee must be a number from 0 to 100",
  "Accept the terms to publish your pool",
  "Choose rates you set or equal value when the unit has no price feed",
  "Message must be 500 characters or fewer",
  "Add a message or choose profile details",
  // Post authoring. Every message the report write schema can produce.
  "Enter a title for your post",
  "Title must be 200 characters or fewer",
  "Post text is too long",
  "Summary must be 10,000 characters or fewer",
  "Media must be an uploaded http(s) URL",
  "Latitude must be between -90 and 90",
  "Longitude must be between -180 and 180",
  "Enter a valid date and time",
  "Choose a voucher",
  "Caption must be 500 characters or fewer",
  "Choose a file or an embed",
  "File name must be 255 characters or fewer",
  "Host must be 200 characters or fewer",
  "Participants must be 100 characters or fewer",
  "Duration must be 100 characters or fewer",
  "Tags must not be blank",
  "Tags must be 100 characters or fewer",
  "Choose at most 12 tags",
  "Link at most 12 vouchers",
  "Add at most 50 images",
  "Add at most 20 attachments",
  "Choose a place on the map or clear it",
  "The end of the period must not be before its start",
  "Each tag can only be added once",
  "Each voucher can only be linked once",
  "Each image can only be added once",
  "Each attachment can only be added once",
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
  });

  it("translates known validation errors into Serbian", async () => {
    await activateLocale("sr");

    expect(translateValidationError("Choose a location", i18n)).toBe("Изаберите локацију");
    expect(translateValidationError("Invalid phone number", i18n)).toBe("Неисправан број телефона");
    expect(translateValidationError("Accept the terms to publish your voucher", i18n)).toBe(
      "Прихватите услове да бисте објавили ваучер",
    );
    expect(translateValidationError("Pool name is required", i18n)).toBe("Назив пула је обавезан");
  });

  it("translates known validation errors into French", async () => {
    await activateLocale("fr");

    expect(translateValidationError("Choose a location", i18n)).toBe("Choisissez un emplacement");
    expect(translateValidationError("Invalid phone number", i18n)).toBe(
      "Numéro de téléphone non valide",
    );
    expect(translateValidationError("Voucher name is required", i18n)).toBe(
      "Le nom du bon d’échange est requis",
    );
    expect(translateValidationError("Pool name is required", i18n)).toBe(
      "Le nom du bassin est requis",
    );
  });

  it("translates known validation errors into Spanish", async () => {
    await activateLocale("es");

    expect(translateValidationError("Choose a location", i18n)).toBe("Elija una ubicación");
    expect(translateValidationError("Invalid phone number", i18n)).toBe(
      "El número de teléfono no es válido",
    );
    expect(translateValidationError("Voucher name is required", i18n)).toBe(
      "El nombre del vale es obligatorio",
    );
    expect(translateValidationError("Pool name is required", i18n)).toBe(
      "El nombre del fondo es obligatorio",
    );
  });

  it("translates known validation errors into Arabic", async () => {
    await activateLocale("ar");

    expect(translateValidationError("Choose a location", i18n)).toBe("اختر موقعًا");
    expect(translateValidationError("Invalid phone number", i18n)).toBe("رقم الهاتف غير صالح");
    expect(translateValidationError("Voucher name is required", i18n)).toBe("اسم القسيمة مطلوب");
    expect(translateValidationError("Pool name is required", i18n)).toBe("اسم الصندوق مطلوب");
  });

  it("translates known validation errors into Portuguese", async () => {
    await activateLocale("pt");

    expect(translateValidationError("Choose a location", i18n)).toBe("Escolha uma localização");
    expect(translateValidationError("Invalid phone number", i18n)).toBe(
      "O número de telefone não é válido",
    );
    expect(translateValidationError("Voucher name is required", i18n)).toBe(
      "O nome do vale é obrigatório",
    );
    expect(translateValidationError("Pool name is required", i18n)).toBe(
      "O nome do fundo é obrigatório",
    );
  });

  it("keeps every known validation error wired to a translated catalog message", async () => {
    for (const locale of ["ar", "es", "fr", "pt", "sr", "sw"] as const) {
      await activateLocale(locale);

      for (const error of knownErrors) {
        expect(translateValidationError(error, i18n)).not.toBe(error);
      }
    }
  });

  it("translates the post schema's own messages", async () => {
    await activateLocale("sw");
    expect(translateValidationError("Enter a title for your post", i18n)).toBe(
      "Weka kichwa cha chapisho lako",
    );
    expect(translateValidationError("Each tag can only be added once", i18n)).toBe(
      "Lebo moja inaweza kuongezwa mara moja tu",
    );

    await activateLocale("sr");
    expect(translateValidationError("Enter a title for your post", i18n)).toBe(
      "Унесите наслов објаве",
    );
    expect(translateValidationError("Choose a place on the map or clear it", i18n)).toBe(
      "Изаберите мјесто на карти или га уклоните",
    );
  });

  it("returns unknown errors unchanged", async () => {
    await activateLocale("sw");

    expect(translateValidationError("Server rejected signup", i18n)).toBe("Server rejected signup");
  });
});
