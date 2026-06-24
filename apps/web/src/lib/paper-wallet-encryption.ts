import "#/lib/browser-node-globals";

import { Buffer } from "buffer";
import * as bip38 from "bip38";
import { bytesToHex, hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type PaperWalletScryptParams = bip38.ScryptParams;

export const SARAFU_DEFAULT_SCRYPT_PARAMS: PaperWalletScryptParams = {
  N: 1 << 15,
  r: 8,
  p: 1,
};

export const PAPER_WALLET_GENERATION_SCRYPT_PARAMS = SARAFU_DEFAULT_SCRYPT_PARAMS;

export const PAPER_WALLET_IMPORT_SCRYPT_PARAMS = SARAFU_DEFAULT_SCRYPT_PARAMS;

const RAW_PRIVATE_KEY_HEX = /^0x[0-9a-fA-F]{64}$/;
const DECRYPTION_ERROR = "Unable to decrypt paper wallet. Check the passphrase and try again.";

export function validatePaperWalletPassphrase(passphrase: string): void {
  if (passphrase.trim() === "") {
    throw new Error("Passphrase cannot be empty.");
  }
}

export function isEncryptedPaperWalletPayload(payload: string): boolean {
  return bip38.verify(payload.trim());
}

export async function encryptPaperWalletPrivateKey(
  privateKey: `0x${string}`,
  passphrase: string,
  scryptParams: PaperWalletScryptParams = PAPER_WALLET_GENERATION_SCRYPT_PARAMS,
): Promise<string> {
  validatePaperWalletPassphrase(passphrase);
  const normalizedKey = normalizePaperWalletPrivateKey(privateKey);
  const privateKeyBytes = Buffer.from(hexToBytes(normalizedKey));
  return bip38.encryptAsync(privateKeyBytes, true, passphrase, undefined, scryptParams);
}

export async function decryptPaperWalletPrivateKey(
  encryptedKey: string,
  passphrase: string,
  scryptParams: PaperWalletScryptParams = PAPER_WALLET_IMPORT_SCRYPT_PARAMS,
): Promise<`0x${string}`> {
  validatePaperWalletPassphrase(passphrase);

  const encrypted = encryptedKey.trim();
  try {
    const decrypted = await bip38.decryptAsync(encrypted, passphrase, undefined, scryptParams);
    return normalizePaperWalletPrivateKey(bytesToHex(decrypted.privateKey));
  } catch {
    throw new Error(DECRYPTION_ERROR);
  }
}

function normalizePaperWalletPrivateKey(privateKey: `0x${string}`): `0x${string}` {
  if (!RAW_PRIVATE_KEY_HEX.test(privateKey)) {
    throw new Error("Invalid private key.");
  }

  const normalized = `0x${privateKey.slice(2).toLowerCase()}` as `0x${string}`;
  privateKeyToAccount(normalized);
  return normalized;
}
