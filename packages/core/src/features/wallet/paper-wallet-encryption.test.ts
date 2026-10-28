import { describe, expect, it } from "vite-plus/test";
import {
  decryptPaperWalletPrivateKey,
  encryptPaperWalletPrivateKey,
  isEncryptedPaperWalletPayload,
  SARAFU_DEFAULT_SCRYPT_PARAMS,
  validatePaperWalletPassphrase,
} from "./paper-wallet-encryption";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const PASSPHRASE = "correct horse battery staple";
const SARAFU_DEFAULT_FIXTURE = "6PYMvQX3P2CjYXVkxczC5ZbPyyiDgRJTZatN6uQUFgYhBbm7idLvfZWzao";
const UNSUPPORTED_SCRYPT_PARAMS_FIXTURE =
  "6PYMvQX3NRvqN2SuLENXqowrkYrKNZ74mA3Lb5zksXxQxTEFcnD2gihvaf";

describe("paper wallet encryption", () => {
  it("rejects an empty passphrase", () => {
    expect(() => validatePaperWalletPassphrase("   ")).toThrow("Passphrase cannot be empty");
  });

  it("encrypts with Sarafu's exported default params for CLC generation", async () => {
    await expect(encryptPaperWalletPrivateKey(PRIVATE_KEY, PASSPHRASE)).resolves.toBe(
      SARAFU_DEFAULT_FIXTURE,
    );
  }, 15_000);

  it("decrypts a Sarafu-default-params fixture back to the original key", async () => {
    await expect(decryptPaperWalletPrivateKey(SARAFU_DEFAULT_FIXTURE, PASSPHRASE)).resolves.toBe(
      PRIVATE_KEY,
    );
  }, 15_000);

  it("rejects a wrong passphrase without exposing low-level details", async () => {
    await expect(
      decryptPaperWalletPrivateKey(SARAFU_DEFAULT_FIXTURE, "wrong passphrase"),
    ).rejects.toThrow("Unable to unlock sign-in card");
  }, 15_000);

  it("rejects encrypted payloads created with unsupported scrypt params", async () => {
    await expect(
      decryptPaperWalletPrivateKey(UNSUPPORTED_SCRYPT_PARAMS_FIXTURE, PASSPHRASE),
    ).rejects.toThrow("Unable to unlock sign-in card");
  }, 15_000);

  it("normalizes decrypted private keys to lowercase 0x hex", async () => {
    const encrypted = await encryptPaperWalletPrivateKey(
      "0xAC0974BEC39A17E36BA4A6B4D238FF944BACB478CBED5EFCAE784D7BF4F2FF80",
      PASSPHRASE,
      SARAFU_DEFAULT_SCRYPT_PARAMS,
    );
    await expect(
      decryptPaperWalletPrivateKey(encrypted, PASSPHRASE, SARAFU_DEFAULT_SCRYPT_PARAMS),
    ).resolves.toBe(PRIVATE_KEY);
  }, 15_000);

  it("identifies encrypted paper wallet payloads", () => {
    expect(isEncryptedPaperWalletPayload(SARAFU_DEFAULT_FIXTURE)).toBe(true);
    expect(isEncryptedPaperWalletPayload(PRIVATE_KEY)).toBe(false);
  });
});
