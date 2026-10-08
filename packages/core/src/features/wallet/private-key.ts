type NormalizeResult = { ok: true; key: `0x${string}` } | { ok: false; error: string };

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/** Order of the secp256k1 group. A private key must lie in [1, n - 1]. */
const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * Whether 64 hex digits name a usable secp256k1 key. Zero and anything at or
 * above the group order are 64 valid hex digits that no signer can use, and
 * reading one from a card must fail before a login or a transaction starts.
 */
function isValidSecp256k1PrivateKey(hex64: string): boolean {
  if (!HEX_64.test(hex64)) return false;
  const value = BigInt(`0x${hex64}`);
  return value > 0n && value < SECP256K1_ORDER;
}

const OUT_OF_RANGE_ERROR = "Invalid private key. It is outside the secp256k1 key range.";

export function normalizePrivateKey(raw: string): NormalizeResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: "Private key is empty." };
  }

  // v1 paper wallet: URL with ?w=<key>
  let candidate = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const w = url.searchParams.get("w");
      if (!w) {
        return {
          ok: false,
          error: "URL does not contain a private key (?w= parameter missing).",
        };
      }
      candidate = w;
    } catch {
      return {
        ok: false,
        error: "Invalid private key. Must be 64 hex characters, with or without 0x prefix.",
      };
    }
  }

  if (candidate.startsWith("0x") || candidate.startsWith("0X")) {
    const body = candidate.slice(2);
    if (HEX_64.test(body)) {
      if (!isValidSecp256k1PrivateKey(body)) return { ok: false, error: OUT_OF_RANGE_ERROR };
      return { ok: true, key: `0x${body.toLowerCase()}` };
    }
    return {
      ok: false,
      error: "Invalid private key. Must be 0x-prefixed 64-char hex.",
    };
  }

  if (HEX_64.test(candidate)) {
    if (!isValidSecp256k1PrivateKey(candidate)) return { ok: false, error: OUT_OF_RANGE_ERROR };
    return { ok: true, key: `0x${candidate.toLowerCase()}` };
  }

  return {
    ok: false,
    error: "Invalid private key. Must be 64 hex characters, with or without 0x prefix.",
  };
}
