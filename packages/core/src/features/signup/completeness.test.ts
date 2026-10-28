import { describe, expect, it } from "vite-plus/test";
import { PAPER_WALLET_PLACEHOLDER_NAME, placeholderSignupEmail } from "../wallet/paper-wallet";
import { hasProfileGaps, profileGaps } from "./completeness";

const ADDRESS = "0xAbCdEf0000000000000000000000000000000001";

describe("profileGaps", () => {
  it("treats a bulk-issued account's placeholders as missing", () => {
    const gaps = profileGaps({
      name: PAPER_WALLET_PLACEHOLDER_NAME,
      email: placeholderSignupEmail(ADDRESS),
      phone: "",
      avatarUrl: null,
    });
    expect(gaps).toEqual({ avatar: true, name: true, contact: true });
    expect(hasProfileGaps(gaps)).toBe(true);
  });

  // Literals, not the constants: these are the values clc-core writes when a
  // wallet with no account signs in, so renaming a constant alone must fail here.
  it("treats the account clc-core registers at sign-in as incomplete", () => {
    expect(
      profileGaps({
        name: "Sign-in card",
        email: "pending+abcdef0000000000000000000000000000000001@clc.local",
        phone: "",
        avatarUrl: null,
      }),
    ).toEqual({ avatar: true, name: true, contact: true });
  });

  it("keeps recognizing the legacy bulk-issued account name", () => {
    expect(
      profileGaps({
        name: "Paper wallet",
        email: placeholderSignupEmail(ADDRESS),
        phone: "",
        avatarUrl: null,
      }).name,
    ).toBe(true);
  });

  it("accepts a phone in place of an email", () => {
    const gaps = profileGaps({
      name: "Amina",
      email: placeholderSignupEmail(ADDRESS),
      phone: "+254712345678",
      avatarUrl: "https://storage.example/a.webp",
    });
    expect(hasProfileGaps(gaps)).toBe(false);
  });

  it("asks an NFC holder to replace the address placeholder name", () => {
    expect(
      profileGaps({
        name: ADDRESS,
        email: placeholderSignupEmail(ADDRESS),
        phone: "",
        avatarUrl: null,
      }),
    ).toEqual({ avatar: true, name: true, contact: true });
  });
});
