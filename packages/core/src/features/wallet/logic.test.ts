import { describe, expect, it } from "vite-plus/test";

import {
  buildSendSharePermission,
  formatTokenAmount,
  formatTokenAmountFixed,
  hasSendSharePermission,
  parseTokenAmount,
  SEND_SHARE_PERMISSION,
  SEND_SHARE_PERMISSION_ALL,
  sendShareFormSchema,
} from "./logic";

describe("formatTokenAmount", () => {
  it("formats raw token units with up to two decimal places", () => {
    expect(formatTokenAmount("100000", 6)).toBe("0.1");
    expect(formatTokenAmount("1234567", 6)).toBe("1.23");
    expect(formatTokenAmount("1000000000000000000", 18)).toBe("1");
  });
});

describe("formatTokenAmountFixed", () => {
  it("keeps exactly two displayed decimals while truncating token dust", () => {
    expect(formatTokenAmountFixed("2134567", 6, 2)).toBe("2.13");
    expect(formatTokenAmountFixed("2000000", 6, 2)).toBe("2.00");
    expect(formatTokenAmountFixed("5", 0, 2)).toBe("5.00");
  });

  it.each([
    ["en", "10,000.00"],
    ["es", "10.000,00"],
    ["fr", "10 000,00"],
    ["pt", "10.000,00"],
    ["sw", "10,000.00"],
    ["sr", "10.000,00"],
  ])("groups fixed amounts for the %s locale", (locale, expected) => {
    expect(formatTokenAmountFixed("10000000000", 6, 2, locale)).toBe(expected);
  });

  it("groups values beyond Number's safe integer range without losing precision", () => {
    expect(formatTokenAmountFixed("9007199254740993123456", 2, 2, "en")).toBe(
      "90,071,992,547,409,931,234.56",
    );
  });

  it("preserves large values with French grouping", () => {
    expect(formatTokenAmountFixed("9007199254740993123456", 2, 2, "fr")).toBe(
      "90 071 992 547 409 931 234,56",
    );
  });
  it("preserves large values with Spanish grouping", () => {
    expect(formatTokenAmountFixed("9007199254740993123456", 2, 2, "es")).toBe(
      "90.071.992.547.409.931.234,56",
    );
  });
  it("preserves large values with Portuguese grouping", () => {
    expect(formatTokenAmountFixed("9007199254740993123456", 2, 2, "pt")).toBe(
      "90.071.992.547.409.931.234,56",
    );
  });
});

describe("parseTokenAmount", () => {
  it("turns an entered decimal amount into raw token units", () => {
    expect(parseTokenAmount("2.13", 6)).toBe("2130000");
    expect(parseTokenAmount("2", 6)).toBe("2000000");
    expect(parseTokenAmount("0.01", 6)).toBe("10000");
  });
});

describe("send share permissions", () => {
  it.each([
    [{ email: false, phone: false, location: false }, 0],
    [{ email: true, phone: false, location: false }, SEND_SHARE_PERMISSION.email],
    [{ email: false, phone: true, location: false }, SEND_SHARE_PERMISSION.phone],
    [{ email: false, phone: false, location: true }, SEND_SHARE_PERMISSION.location],
    [{ email: true, phone: true, location: true }, SEND_SHARE_PERMISSION_ALL],
  ] as const)("builds %# permissions", (selection, expected) => {
    expect(buildSendSharePermission(selection)).toBe(expected);
  });

  it("checks individual flags without confusing combined masks", () => {
    const permission = SEND_SHARE_PERMISSION.email | SEND_SHARE_PERMISSION.location;
    expect(hasSendSharePermission(permission, SEND_SHARE_PERMISSION.email)).toBe(true);
    expect(hasSendSharePermission(permission, SEND_SHARE_PERMISSION.phone)).toBe(false);
    expect(hasSendSharePermission(permission, SEND_SHARE_PERMISSION.location)).toBe(true);
  });

  it("requires an attachment to contain a note or selected profile details", () => {
    expect(
      sendShareFormSchema.safeParse({ note: "", email: false, phone: false, location: false })
        .success,
    ).toBe(false);
    expect(
      sendShareFormSchema.parse({
        note: "  Thanks  ",
        email: false,
        phone: false,
        location: false,
      }).note,
    ).toBe("Thanks");
  });
});
