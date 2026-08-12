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

  return { type: "invalid", error: "This QR code does not contain a valid paper wallet." };
}

function extractPaperWalletPayload(
  raw: string,
): { ok: true; payload: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Paper wallet payload is empty." };
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const payload = url.searchParams.get("w");
      if (!payload) {
        return {
          ok: false,
          error: "URL does not contain a paper wallet payload (?w= parameter missing).",
        };
      }
      return { ok: true, payload };
    } catch {
      return { ok: false, error: "Invalid paper wallet URL." };
    }
  }

  return { ok: true, payload: trimmed };
}
