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
