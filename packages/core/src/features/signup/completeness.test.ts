import { describe, expect, it } from "vite-plus/test";
import { placeholderSignupEmail } from "../wallet/paper-wallet";
import { hasProfileGaps, profileGaps } from "./completeness";

const ADDRESS = "0xAbCdEf0000000000000000000000000000000001";

describe("profileGaps", () => {
  it("treats a bulk-issued account's placeholders as missing", () => {
    const gaps = profileGaps({
      name: "Paper wallet",
      email: placeholderSignupEmail(ADDRESS),
      phone: "",
      avatarUrl: null,
    });
    expect(gaps).toEqual({ avatar: true, name: true, contact: true });
    expect(hasProfileGaps(gaps)).toBe(true);
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
});
