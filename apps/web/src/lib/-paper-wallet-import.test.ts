import { describe, expect, it } from "vite-plus/test";
import { parsePaperWalletImportPayload } from "./paper-wallet-import";

const RAW_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const BARE_RAW_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ENCRYPTED_KEY = "6PYMvQX3NRvqN2SuLENXqowrkYrKNZ74mA3Lb5zksXxQxTEFcnD2gihvaf";

describe("parsePaperWalletImportPayload", () => {
  it("classifies a 0x raw private key as raw", () => {
    expect(parsePaperWalletImportPayload(RAW_KEY)).toEqual({ type: "raw", key: RAW_KEY });
  });

  it("classifies a bare raw private key as raw and normalizes it", () => {
    expect(parsePaperWalletImportPayload(BARE_RAW_KEY)).toEqual({
      type: "raw",
      key: RAW_KEY,
    });
  });

  it("classifies a CLC URL with a raw key as raw", () => {
    expect(parsePaperWalletImportPayload(`https://cosmolocal.credit/?w=${RAW_KEY}`)).toEqual({
      type: "raw",
      key: RAW_KEY,
    });
  });

  it("classifies a Sarafu-style URL with a raw key as raw", () => {
    expect(parsePaperWalletImportPayload(`https://sarafu.network/login?w=${BARE_RAW_KEY}`)).toEqual(
      {
        type: "raw",
        key: RAW_KEY,
      },
    );
  });

  it("classifies a bare BIP38 key as encrypted", () => {
    expect(parsePaperWalletImportPayload(ENCRYPTED_KEY)).toEqual({
      type: "encrypted",
      encryptedKey: ENCRYPTED_KEY,
    });
  });

  it("classifies a URL with a BIP38 key as encrypted", () => {
    expect(parsePaperWalletImportPayload(`https://cosmolocal.credit/?w=${ENCRYPTED_KEY}`)).toEqual({
      type: "encrypted",
      encryptedKey: ENCRYPTED_KEY,
    });
  });

  it("returns invalid for a URL without w", () => {
    expect(parsePaperWalletImportPayload("https://cosmolocal.credit/login").type).toBe("invalid");
  });

  it("returns invalid for random text", () => {
    expect(parsePaperWalletImportPayload("not-a-paper-wallet").type).toBe("invalid");
  });
});
