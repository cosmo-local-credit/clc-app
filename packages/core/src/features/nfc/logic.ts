import {
  type PaperWalletImportPayload,
  parsePaperWalletImportPayload,
} from "../wallet/paper-wallet";

/**
 * NFC wallet cards: the platform-agnostic half.
 *
 * A card is another carrier of the paper-wallet credential — one NDEF URL
 * record holding the same `?w=` link a printed QR does. Each app owns its own
 * `NDEFReader` adapter under `#/lib/nfc/`; everything that decides what a tag
 * means, how a platform error reads, and which lifecycle step comes next lives
 * here, so the two adapters can drift only in plumbing, never in behaviour.
 *
 * Nothing in this module touches a browser global. A React Native adapter
 * implements the same `NfcScanner` / `NfcWriter` contract.
 */

/** One NDEF record, with its bytes copied out of the platform's view. */
export type NfcRecord = {
  recordType: string;
  mediaType: string | null;
  /** Text records only. */
  encoding: string | null;
  /** Null for an `empty` record. */
  data: Uint8Array | null;
};

export type NfcReading = {
  /**
   * Empty on many phones and tags, and not stable across all of them.
   * Supporting metadata for spotting a card left on the reader — never the
   * identity of the wallet it carries.
   */
  serialNumber: string | null;
  records: readonly NfcRecord[];
};

export type NfcScanHandlers = {
  onReading: (reading: NfcReading) => void;
  /** A tag came into range but could not be read. Not the same as a blank tag. */
  onReadingError: () => void;
};

export interface NfcScanner {
  /**
   * Starts listening. Resolves once the reader is ready — not when a card has
   * been read — and rejects with the platform's error. Aborting `signal`
   * stops the scan and detaches both handlers.
   */
  scan(handlers: NfcScanHandlers, signal: AbortSignal): Promise<void>;
}

export type NfcWriteOptions = {
  /**
   * False refuses a tag that already holds NDEF records. Only a deliberate
   * operator action may set it, never a retry after a refusal.
   */
  overwrite: boolean;
  signal: AbortSignal;
};

export interface NfcWriter {
  /** Writes exactly one URL record. Resolves once the tag has been written. */
  writeUrl(url: string, options: NfcWriteOptions): Promise<void>;
}

// ---------------------------------------------------------------------------
// Record decoding

function decodeText(data: Uint8Array, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

/**
 * The text a record carries, when it is a kind a wallet credential can travel
 * in: a URL, a text record, or a `text/plain` MIME record. Anything else is
 * not a wallet, whatever its bytes say.
 */
export function nfcRecordText(record: NfcRecord): string | null {
  if (!record.data) return null;
  switch (record.recordType) {
    case "url":
    case "absolute-url":
      return decodeText(record.data, "utf-8");
    case "text":
      return decodeText(record.data, record.encoding ?? "utf-8");
    case "mime": {
      const mediaType = record.mediaType?.split(";")[0]?.trim().toLowerCase();
      return mediaType === "text/plain" ? decodeText(record.data, "utf-8") : null;
    }
    default:
      return null;
  }
}

type NfcWalletCredential = Exclude<PaperWalletImportPayload, { type: "invalid" }>;

export type NfcCardContent =
  /** No records, or only `empty` ones. A browser may still refuse to treat it as blank. */
  | { kind: "blank" }
  | { kind: "credential"; credential: NfcWalletCredential }
  /** Two or more different wallet credentials: refuse rather than guess. */
  | { kind: "ambiguous" }
  /** Shaped like a wallet payload but unusable — a damaged or out-of-range key. */
  | { kind: "invalid-credential" }
  /** Records present, none of them a wallet. */
  | { kind: "unrecognized" };

const WALLET_SHAPED = /^(0x)?[0-9a-f]{64}$|^6P/i;

function looksLikeWalletPayload(text: string): boolean {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).searchParams.has("w");
    } catch {
      return false;
    }
  }
  return WALLET_SHAPED.test(trimmed);
}

function credentialKey(credential: NfcWalletCredential): string {
  return credential.type === "raw" ? `raw:${credential.key}` : `enc:${credential.encryptedKey}`;
}

/**
 * What a tag holds, decided from its records alone. A record's URL is data:
 * the `?w=` payload is lifted out and parsed, and the link is never followed.
 *
 * The same credential repeated across records (a URL and a text copy) is one
 * credential; two different ones are ambiguous.
 */
export function readNfcCardContent(reading: NfcReading): NfcCardContent {
  const meaningful = reading.records.filter((record) => record.recordType !== "empty");
  if (meaningful.length === 0) return { kind: "blank" };

  const found = new Map<string, NfcWalletCredential>();
  let invalid = false;
  for (const record of meaningful) {
    const text = nfcRecordText(record);
    if (text === null) continue;
    const parsed = parsePaperWalletImportPayload(text);
    if (parsed.type === "invalid") {
      if (looksLikeWalletPayload(text)) invalid = true;
      continue;
    }
    found.set(credentialKey(parsed), parsed);
  }

  if (found.size > 1) return { kind: "ambiguous" };
  const [credential] = found.values();
  if (credential) return { kind: "credential", credential };
  return invalid ? { kind: "invalid-credential" } : { kind: "unrecognized" };
}

/**
 * Whether a fresh read of a card is exactly the record that was written to it:
 * one URL record whose text equals `expectedUrl`. Anything more, less or
 * different is a mismatch, and a mismatch never marks a card issued.
 */
export function nfcReadingMatchesUrl(reading: NfcReading, expectedUrl: string): boolean {
  const meaningful = reading.records.filter((record) => record.recordType !== "empty");
  if (meaningful.length !== 1) return false;
  const [record] = meaningful;
  if (!record || (record.recordType !== "url" && record.recordType !== "absolute-url")) {
    return false;
  }
  return nfcRecordText(record) === expectedUrl;
}

// ---------------------------------------------------------------------------
// Errors

export type NfcErrorKind =
  /** No Web NFC, no adapter, or a tag that does not take NDEF. */
  | "unsupported"
  | "permission-denied"
  /** The adapter is unavailable: NFC switched off, or blocked by user preference. */
  | "disabled"
  | "aborted"
  /** The reader is already active, or the page is not the top-level context. */
  | "busy"
  /** A write with `overwrite: false` met a tag that already holds records. */
  | "tag-occupied"
  /** The transfer failed mid-write. The tag may now hold part of the record. */
  | "transfer-failed"
  | "unknown";

export type NfcErrorContext = {
  operation: "scan" | "write";
  /** The `nfc` permission state, when the platform can report it. */
  permission?: "granted" | "denied" | "prompt" | null;
  /** A reading seen during this write showed the tag already holds records. */
  tagHadRecords?: boolean;
};

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  return typeof error.name === "string" ? error.name : null;
}

/**
 * Maps a platform rejection to what the user can do about it.
 *
 * Web NFC uses `NotAllowedError` for two unrelated things on `write()`: a
 * denied permission and a tag that is not blank under `overwrite: false`. The
 * context separates them — a tag seen holding records, or a permission
 * already granted, means the card was refused, not the operator.
 */
export function classifyNfcError(error: unknown, context: NfcErrorContext): NfcErrorKind {
  switch (errorName(error)) {
    case "AbortError":
      return "aborted";
    case "NotSupportedError":
      return "unsupported";
    case "NotReadableError":
      return "disabled";
    case "InvalidStateError":
      return "busy";
    case "NetworkError":
      return context.operation === "write" ? "transfer-failed" : "unknown";
    case "NotAllowedError":
      if (
        context.operation === "write" &&
        (context.tagHadRecords === true || context.permission === "granted")
      ) {
        return "tag-occupied";
      }
      return "permission-denied";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Reader lifecycle

/**
 * ```text
 * idle -> starting -> ready -> handling -> complete
 *                  |           |
 *                  +---------> error
 * any active state -> cancelled
 * ```
 */
export type NfcSessionPhase =
  | "idle"
  | "starting"
  | "ready"
  | "handling"
  | "complete"
  | "error"
  | "cancelled";

export type NfcSessionEvent =
  | { type: "start" }
  | { type: "started" }
  | { type: "tag" }
  /** `done` ends the session; otherwise it keeps listening for the next card. */
  | { type: "handled"; done: boolean }
  | { type: "fail" }
  | { type: "cancel" };

function isNfcSessionActive(phase: NfcSessionPhase): boolean {
  return phase === "starting" || phase === "ready" || phase === "handling";
}

/**
 * The next lifecycle phase, or the current one when the event does not apply.
 *
 * Held in a ref and advanced synchronously, this is the in-flight latch: a
 * second `tag` while one is `handling` is not a transition, so it is dropped
 * before any parsing, login or relay has been awaited.
 */
export function nextNfcSessionPhase(
  phase: NfcSessionPhase,
  event: NfcSessionEvent,
): NfcSessionPhase {
  switch (event.type) {
    case "start":
      return isNfcSessionActive(phase) ? phase : "starting";
    case "started":
      return phase === "starting" ? "ready" : phase;
    case "tag":
      return phase === "ready" ? "handling" : phase;
    case "handled":
      if (phase !== "handling") return phase;
      return event.done ? "complete" : "ready";
    case "fail":
      return isNfcSessionActive(phase) ? "error" : phase;
    case "cancel":
      return isNfcSessionActive(phase) ? "cancelled" : phase;
  }
}

// ---------------------------------------------------------------------------
// Tag capacity

/** NFC Forum URI identifier codes the record can abbreviate, longest first. */
const URI_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ["https://www.", 0x02],
  ["http://www.", 0x01],
  ["https://", 0x04],
  ["http://", 0x03],
];

/**
 * Bytes of the NDEF message holding one URL record, with the URI prefix
 * abbreviated the way Android encodes it. Excludes the tag's TLV wrapper.
 */
export function ndefUrlMessageSize(url: string): number {
  const prefix = URI_PREFIXES.find(([candidate]) => url.startsWith(candidate))?.[0] ?? "";
  const payloadLength = 1 + new TextEncoder().encode(url.slice(prefix.length)).length;
  // Header, type length, payload length (one byte for a short record, four
  // otherwise), the one-byte type "U", then the payload.
  return 1 + 1 + (payloadLength < 256 ? 1 : 4) + 1 + payloadLength;
}

/** User memory of the common NTAG21x cards, in bytes. */
export const NFC_TAG_CAPACITIES = [
  { name: "NTAG213", bytes: 144 },
  { name: "NTAG215", bytes: 504 },
  { name: "NTAG216", bytes: 888 },
] as const;

/** Whether a message fits a tag once wrapped in its NDEF TLV and terminator. */
export function ndefMessageFits(messageSize: number, capacityBytes: number): boolean {
  const tlv = messageSize < 255 ? 2 : 4;
  return messageSize + tlv + 1 <= capacityBytes;
}

// ---------------------------------------------------------------------------
// Measurement

/** Nearest-rank p50 / p95 of a set of durations, for honest pilot reporting. */
export function summarizeDurations(durationsMs: readonly number[]): {
  count: number;
  p50: number | null;
  p95: number | null;
} {
  if (durationsMs.length === 0) return { count: 0, p50: null, p95: null };
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] as number;
  return { count: sorted.length, p50: rank(0.5), p95: rank(0.95) };
}
