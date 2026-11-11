import { describe, expect, it } from "vite-plus/test";

import {
  acceptScannedRecipient,
  normalizeScannedRecipient,
} from "#/components/wallet/recipient-validation";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("normalizeScannedRecipient", () => {
  it("accepts an EIP-681 address request from the receive QR", () => {
    expect(normalizeScannedRecipient(`ethereum:${ADDRESS}@42220`)).toBe(ADDRESS);
  });

  it("does not keep the first 40 hex digits of a private key", () => {
    expect(normalizeScannedRecipient(PRIVATE_KEY)).toBe(PRIVATE_KEY);
    expect(normalizeScannedRecipient(`https://cosmolocal.credit/?w=${PRIVATE_KEY}`)).toBe(
      `https://cosmolocal.credit/?w=${PRIVATE_KEY}`,
    );
  });
});

describe("acceptScannedRecipient", () => {
  it("returns the address from a receive QR", () => {
    expect(acceptScannedRecipient(`ethereum:${ADDRESS}@100`)).toEqual({
      ok: true,
      value: ADDRESS,
    });
  });

  it("refuses a raw key and a sign-in card link", () => {
    expect(acceptScannedRecipient(PRIVATE_KEY)).toEqual({ ok: false, reason: "sign-in-card" });
    expect(acceptScannedRecipient(`https://cosmolocal.credit/?w=${PRIVATE_KEY}`)).toEqual({
      ok: false,
      reason: "sign-in-card",
    });
  });
});
