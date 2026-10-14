import { msg } from "@lingui/core/macro";
import { BackendApiError } from "@clc/api/client/errors";
import { activateLocale, i18n } from "@clc/i18n/index";
import { LOCALE_OPTIONS } from "@clc/i18n/locales";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { translateRecipientError } from "./recipient-error-i18n";
import { translateValidationError } from "./validation-i18n";

const messages = [
  msg`Username`,
  msg`Suggest username`,
  msg`Finding a name…`,
  msg`Couldn't suggest a username. Please try again.`,
  msg`People can use this name to send vouchers to you.`,
  msg`People can use this name to send vouchers to you. Leave blank to keep your current username.`,
  msg`Enter a username, pool name, phone number or address.`,
  msg`Recipient username, pool name, phone or address`,
  msg`Matching recipients`,
  msg`Searching recipients…`,
  msg`No matching recipients.`,
  msg`Pool symbol`,
  msg`Enter pool symbol, eg. ABC1`,
  { id: "Pool symbol is required", message: "Pool symbol is required" },
  {
    id: "Pool symbol must be at least 3 characters",
    message: "Pool symbol must be at least 3 characters",
  },
  {
    id: "Pool symbol must be 6 characters or fewer",
    message: "Pool symbol must be 6 characters or fewer",
  },
  {
    id: "Use only letters and numbers for the pool symbol",
    message: "Use only letters and numbers for the pool symbol",
  },
  {
    id: "Username must contain 1–80 characters",
    message: "Username must contain 1–80 characters",
  },
  {
    id: "That username or pool name is already taken",
    message: "That username or pool name is already taken",
  },
  { id: "That name or symbol is already taken", message: "That name or symbol is already taken" },
];

afterEach(async () => activateLocale("en"));

describe("recipient translations", () => {
  it.each(LOCALE_OPTIONS.filter(({ code }) => code !== "en"))(
    "renders feature messages in $code without English fallback",
    async ({ code }) => {
      await activateLocale("en");
      const english = messages.map((message) => i18n._(message));
      await activateLocale(code);
      messages.forEach((message, index) => {
        const translated = i18n._(message);
        expect(translated, `${code}: ${english[index]}`).not.toBe(english[index]);
        expect(translated.trim()).not.toBe("");
      });
      const conflict = translateRecipientError(
        new BackendApiError(409, "username or pool name is already in use"),
        i18n,
      );
      expect(conflict).toBe(i18n._("That username or pool name is already taken"));
      expect(translateValidationError("Username must contain 1–80 characters", i18n)).toBe(
        i18n._("Username must contain 1–80 characters"),
      );
    },
  );

  it("translates each known identity response and leaves unrelated errors to existing handlers", async () => {
    await activateLocale("sr");
    expect(
      translateRecipientError(
        new BackendApiError(409, "a pool with this name already exists"),
        i18n,
      ),
    ).toBe(i18n._("That username or pool name is already taken"));
    expect(
      translateRecipientError(new BackendApiError(409, "name or symbol is already in use"), i18n),
    ).toBe(i18n._("That name or symbol is already taken"));
    expect(
      translateRecipientError(
        new BackendApiError(400, "username must contain 1–80 characters"),
        i18n,
      ),
    ).toBe(translateValidationError("Username must contain 1–80 characters", i18n));
    expect(
      translateRecipientError(
        new BackendApiError(409, "email already linked to another account"),
        i18n,
      ),
    ).toBeNull();
    expect(translateRecipientError(new Error("network"), i18n)).toBeNull();
  });
});
