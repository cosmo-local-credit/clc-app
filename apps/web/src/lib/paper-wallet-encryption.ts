import { ecb } from "@noble/ciphers/aes";
import { secp256k1 } from "@noble/curves/secp256k1";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { scryptAsync } from "@noble/hashes/scrypt";
import { sha256 } from "@noble/hashes/sha256";
import { base58check } from "@scure/base";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

// BIP38 (the `6P...` "encrypted WIF") implemented directly on audited,
// browser-native crypto. This is an interop format with Sarafu, so the byte
// layout is fixed by the spec and pinned by the fixtures in
// -paper-wallet-encryption.test.ts. No Node builtins / polyfills are used.

const bs58check = base58check(sha256);

export type PaperWalletScryptParams = { N: number; r: number; p: number };

export const SARAFU_DEFAULT_SCRYPT_PARAMS: PaperWalletScryptParams = {
  N: 1 << 15,
  r: 8,
  p: 1,
};

export const PAPER_WALLET_GENERATION_SCRYPT_PARAMS = SARAFU_DEFAULT_SCRYPT_PARAMS;

export const PAPER_WALLET_IMPORT_SCRYPT_PARAMS = SARAFU_DEFAULT_SCRYPT_PARAMS;

const RAW_PRIVATE_KEY_HEX = /^0x[0-9a-fA-F]{64}$/;
const DECRYPTION_ERROR = "Unable to decrypt paper wallet. Check the password and try again.";

// BIP38 non-EC-multiply payload: 0x01 0x42 flag | salt(4) | cipher(32) = 39 bytes.
const BIP38_LENGTH = 39;
const BIP38_PREFIX = 0x01;
const BIP38_TYPE_NON_EC = 0x42;
const BIP38_TYPE_EC_MULT = 0x43;
const FLAG_COMPRESSED = 0xe0;
const FLAG_UNCOMPRESSED = 0xc0;

function doubleSha256(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes));
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] ^ b[i];
  return out;
}

// BIP38 salt: first 4 bytes of double-SHA256 of the Base58Check Bitcoin address
// *string* (mainnet P2PKH, 0x00 version) derived from the private key.
function addressChecksum(privateKey: Uint8Array, compressed: boolean): Uint8Array {
  const publicKey = secp256k1.getPublicKey(privateKey, compressed);
  const hash160 = ripemd160(sha256(publicKey));
  const address = bs58check.encode(concatBytes(new Uint8Array([0x00]), hash160));
  return doubleSha256(utf8ToBytes(address)).slice(0, 4);
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  { N, r, p }: PaperWalletScryptParams,
): Promise<{ half1: Uint8Array; half2: Uint8Array }> {
  const derived = await scryptAsync(utf8ToBytes(passphrase.normalize("NFC")), salt, {
    N,
    r,
    p,
    dkLen: 64,
  });
  return { half1: derived.subarray(0, 32), half2: derived.subarray(32, 64) };
}

export function validatePaperWalletPassphrase(passphrase: string): void {
  if (passphrase.trim() === "") {
    throw new Error("Passphrase cannot be empty.");
  }
}

export function isEncryptedPaperWalletPayload(payload: string): boolean {
  let decoded: Uint8Array;
  try {
    decoded = bs58check.decode(payload.trim());
  } catch {
    return false;
  }
  if (decoded.length !== BIP38_LENGTH || decoded[0] !== BIP38_PREFIX) return false;

  const flag = decoded[2];
  if (decoded[1] === BIP38_TYPE_NON_EC)
    return flag === FLAG_COMPRESSED || flag === FLAG_UNCOMPRESSED;
  if (decoded[1] === BIP38_TYPE_EC_MULT) return (flag & ~0x24) === 0;
  return false;
}

export async function encryptPaperWalletPrivateKey(
  privateKey: `0x${string}`,
  passphrase: string,
  scryptParams: PaperWalletScryptParams = PAPER_WALLET_GENERATION_SCRYPT_PARAMS,
): Promise<string> {
  validatePaperWalletPassphrase(passphrase);
  const normalized = normalizePaperWalletPrivateKey(privateKey);
  const keyBytes = hexToBytes(normalized.slice(2));
  const compressed = true;

  const salt = addressChecksum(keyBytes, compressed);
  const { half1, half2 } = await deriveKey(passphrase, salt, scryptParams);
  const cipherText = ecb(half2, { disablePadding: true }).encrypt(xorBytes(keyBytes, half1));

  const payload = new Uint8Array(BIP38_LENGTH);
  payload[0] = BIP38_PREFIX;
  payload[1] = BIP38_TYPE_NON_EC;
  payload[2] = compressed ? FLAG_COMPRESSED : FLAG_UNCOMPRESSED;
  payload.set(salt, 3);
  payload.set(cipherText, 7);
  return bs58check.encode(payload);
}

export async function decryptPaperWalletPrivateKey(
  encryptedKey: string,
  passphrase: string,
  scryptParams: PaperWalletScryptParams = PAPER_WALLET_IMPORT_SCRYPT_PARAMS,
): Promise<`0x${string}`> {
  validatePaperWalletPassphrase(passphrase);

  try {
    const decoded = bs58check.decode(encryptedKey.trim());
    if (
      decoded.length !== BIP38_LENGTH ||
      decoded[0] !== BIP38_PREFIX ||
      decoded[1] !== BIP38_TYPE_NON_EC
    ) {
      throw new Error("Unsupported BIP38 payload.");
    }
    const flag = decoded[2];
    const compressed = flag === FLAG_COMPRESSED;
    if (!compressed && flag !== FLAG_UNCOMPRESSED) throw new Error("Unsupported BIP38 flag.");

    const salt = decoded.subarray(3, 7);
    const { half1, half2 } = await deriveKey(passphrase, salt, scryptParams);
    const privateKeyBytes = xorBytes(
      ecb(half2, { disablePadding: true }).decrypt(decoded.subarray(7, BIP38_LENGTH)),
      half1,
    );

    // Wrong passphrase or wrong scrypt params yield a key whose address salt
    // no longer matches the embedded one.
    const expected = addressChecksum(privateKeyBytes, compressed);
    if (expected.some((byte, i) => byte !== salt[i])) throw new Error("Address checksum mismatch.");

    return normalizePaperWalletPrivateKey(`0x${bytesToHex(privateKeyBytes)}`);
  } catch {
    throw new Error(DECRYPTION_ERROR);
  }
}

function normalizePaperWalletPrivateKey(privateKey: `0x${string}`): `0x${string}` {
  if (!RAW_PRIVATE_KEY_HEX.test(privateKey)) {
    throw new Error("Invalid private key.");
  }

  return `0x${privateKey.slice(2).toLowerCase()}` as `0x${string}`;
}
