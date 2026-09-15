import { describe, expect, it } from "vite-plus/test";

import { normalizeScannedRecipient } from "./recipient-validation";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;

describe("normalizeScannedRecipient", () => {
  it("accepts an EIP-681 address request from the receive QR", () => {
    expect(normalizeScannedRecipient(`ethereum:${ADDRESS}@42220`)).toBe(ADDRESS);
  });
});
