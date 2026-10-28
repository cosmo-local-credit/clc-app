import { normalizePrivateKey } from "./private-key";

const ENCRYPTED_PAPER_WALLET_PAYLOAD = /^6P[1-9A-HJ-NP-Za-km-z]{56}$/;

export type PaperWalletImportPayload =
  | { type: "raw"; key: `0x${string}` }
  | { type: "encrypted"; encryptedKey: string }
  | { type: "invalid"; error: string };

export function parsePaperWalletImportPayload(raw: string): PaperWalletImportPayload {
  const extracted = extractPaperWalletPayload(raw);
  if (!extracted.ok) {
    return { type: "invalid", error: extracted.error };
  }

  const privateKey = normalizePrivateKey(extracted.payload);
  if (privateKey.ok) {
    return { type: "raw", key: privateKey.key };
  }

  const trimmedPayload = extracted.payload.trim();
  if (ENCRYPTED_PAPER_WALLET_PAYLOAD.test(trimmedPayload)) {
    return { type: "encrypted", encryptedKey: trimmedPayload };
  }

  return { type: "invalid", error: "This QR code does not contain a valid sign-in card." };
}

function extractPaperWalletPayload(
  raw: string,
): { ok: true; payload: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Sign-in card payload is empty." };
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const payload = url.searchParams.get("w");
      if (!payload) {
        return {
          ok: false,
          error: "URL does not contain a sign-in card payload (?w= parameter missing).",
        };
      }
      return { ok: true, payload };
    } catch {
      return { ok: false, error: "Invalid sign-in card URL." };
    }
  }

  return { ok: true, payload: trimmed };
}

/** The QR payload on every paper wallet: a link that opens the app and imports the key. */
export function buildPaperWalletUrl(origin: string, payload: string): string {
  return `${origin.replace(/\/+$/, "")}/?w=${encodeURIComponent(payload)}`;
}

/**
 * Signup requires a name and a unique email, but a paper wallet can be issued
 * before its holder has given either. These stand in until the holder edits
 * their profile, and `profileGaps` treats both as missing.
 */
export const PAPER_WALLET_PLACEHOLDER_NAME = "Sign-in card";
export const LEGACY_PAPER_WALLET_PLACEHOLDER_NAME = "Paper wallet";

const PLACEHOLDER_EMAIL_DOMAIN = "@clc.local";

export function placeholderSignupEmail(address: string): string {
  return `pending+${address.replace(/^0x/i, "").toLowerCase()}${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderSignupEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}
