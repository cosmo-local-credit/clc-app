import { describe, expect, it } from "vite-plus/test";

import { buildPaperWalletUrl } from "../wallet/paper-wallet";
import {
  classifyNfcError,
  ndefMessageFits,
  ndefUrlMessageSize,
  type NfcReading,
  type NfcRecord,
  nfcReadingMatchesUrl,
  readNfcCardContent,
  summarizeDurations,
} from "./logic";

const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OTHER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ENCRYPTED = `6P${"Rf".repeat(28)}`;
const ORIGIN = "https://cosmolocal.credit";

const encode = (text: string) => new TextEncoder().encode(text);

function url(text: string): NfcRecord {
  return { recordType: "url", mediaType: null, encoding: null, data: encode(text) };
}

function text(value: string, encoding = "utf-8"): NfcRecord {
  const data =
    encoding === "utf-16be"
      ? new Uint8Array(
          Array.from({ length: value.length }, (_, i) => [0, value.charCodeAt(i)]).flat(),
        )
      : encode(value);
  return { recordType: "text", mediaType: null, encoding, data };
}

const empty: NfcRecord = { recordType: "empty", mediaType: null, encoding: null, data: null };

function reading(...records: NfcRecord[]): NfcReading {
  return { serialNumber: "04:a1:b2:c3", records };
}

describe("readNfcCardContent", () => {
  it("reads a raw key from the provisioned URL record", () => {
    expect(readNfcCardContent(reading(url(buildPaperWalletUrl(ORIGIN, KEY))))).toEqual({
      kind: "credential",
      credential: { type: "raw", key: KEY },
    });
  });

  it("reads an encrypted payload", () => {
    expect(readNfcCardContent(reading(url(buildPaperWalletUrl(ORIGIN, ENCRYPTED))))).toEqual({
      kind: "credential",
      credential: { type: "encrypted", encryptedKey: ENCRYPTED },
    });
  });

  it("accepts plain text payloads, in UTF-8 and UTF-16", () => {
    expect(readNfcCardContent(reading(text(KEY)))).toMatchObject({ kind: "credential" });
    expect(readNfcCardContent(reading(text(KEY, "utf-16be")))).toMatchObject({
      kind: "credential",
      credential: { type: "raw", key: KEY },
    });
  });

  it("accepts a text/plain MIME record but not other media types", () => {
    const mime = (mediaType: string): NfcRecord => ({
      recordType: "mime",
      mediaType,
      encoding: null,
      data: encode(KEY),
    });
    expect(readNfcCardContent(reading(mime("text/plain; charset=utf-8")))).toMatchObject({
      kind: "credential",
    });
    expect(readNfcCardContent(reading(mime("application/octet-stream")))).toEqual({
      kind: "unrecognized",
    });
  });

  it("treats no records, or only empty ones, as blank", () => {
    expect(readNfcCardContent(reading())).toEqual({ kind: "blank" });
    expect(readNfcCardContent(reading(empty))).toEqual({ kind: "blank" });
  });

  it("collapses the same credential repeated across records", () => {
    expect(
      readNfcCardContent(reading(url(buildPaperWalletUrl(ORIGIN, KEY)), text(KEY))),
    ).toMatchObject({ kind: "credential" });
  });

  it("refuses a message carrying two different credentials", () => {
    expect(
      readNfcCardContent(reading(url(buildPaperWalletUrl(ORIGIN, KEY)), text(OTHER_KEY))),
    ).toEqual({ kind: "ambiguous" });
  });

  it("does not report success for unrelated content", () => {
    expect(readNfcCardContent(reading(url("https://example.com/menu")))).toEqual({
      kind: "unrecognized",
    });
    expect(readNfcCardContent(reading(text("hello")))).toEqual({ kind: "unrecognized" });
  });

  it("flags a wallet-shaped payload with an unusable key", () => {
    const zero = `0x${"0".repeat(64)}`;
    expect(readNfcCardContent(reading(url(buildPaperWalletUrl(ORIGIN, zero))))).toEqual({
      kind: "invalid-credential",
    });
    expect(readNfcCardContent(reading(text("f".repeat(64))))).toEqual({
      kind: "invalid-credential",
    });
  });

  it("ignores undecodable bytes instead of throwing", () => {
    const broken: NfcRecord = {
      recordType: "url",
      mediaType: null,
      encoding: null,
      data: new Uint8Array([0xff, 0xfe, 0xfd]),
    };
    expect(readNfcCardContent(reading(broken))).toEqual({ kind: "unrecognized" });
  });
});

describe("nfcReadingMatchesUrl", () => {
  const expected = buildPaperWalletUrl(ORIGIN, KEY);

  it("matches exactly one equal URL record", () => {
    expect(nfcReadingMatchesUrl(reading(url(expected)), expected)).toBe(true);
    expect(nfcReadingMatchesUrl(reading(url(expected), empty), expected)).toBe(true);
  });

  it("rejects extra records, other rows and blank cards", () => {
    expect(nfcReadingMatchesUrl(reading(url(expected), text("x")), expected)).toBe(false);
    expect(
      nfcReadingMatchesUrl(reading(url(buildPaperWalletUrl(ORIGIN, OTHER_KEY))), expected),
    ).toBe(false);
    expect(nfcReadingMatchesUrl(reading(), expected)).toBe(false);
    expect(nfcReadingMatchesUrl(reading(text(expected)), expected)).toBe(false);
  });
});

describe("classifyNfcError", () => {
  const dom = (name: string) => Object.assign(new Error(name), { name });

  it("maps platform errors to recoverable kinds", () => {
    expect(classifyNfcError(dom("AbortError"), { operation: "scan" })).toBe("aborted");
    expect(classifyNfcError(dom("NotSupportedError"), { operation: "scan" })).toBe("unsupported");
    expect(classifyNfcError(dom("NotReadableError"), { operation: "scan" })).toBe("disabled");
    expect(classifyNfcError(dom("InvalidStateError"), { operation: "scan" })).toBe("busy");
    expect(classifyNfcError(dom("NetworkError"), { operation: "write" })).toBe("transfer-failed");
    expect(classifyNfcError(new Error("boom"), { operation: "scan" })).toBe("unknown");
    expect(classifyNfcError("not an error", { operation: "write" })).toBe("unknown");
  });

  it("separates a denied permission from a refused card", () => {
    const notAllowed = dom("NotAllowedError");
    expect(classifyNfcError(notAllowed, { operation: "scan" })).toBe("permission-denied");
    expect(classifyNfcError(notAllowed, { operation: "write", permission: "denied" })).toBe(
      "permission-denied",
    );
    expect(classifyNfcError(notAllowed, { operation: "write", permission: "granted" })).toBe(
      "tag-occupied",
    );
    expect(classifyNfcError(notAllowed, { operation: "write", tagHadRecords: true })).toBe(
      "tag-occupied",
    );
  });
});

describe("ndefUrlMessageSize", () => {
  it("abbreviates the https:// prefix", () => {
    // 3 header bytes + "U" + identifier code + "a.b"
    expect(ndefUrlMessageSize("https://a.b")).toBe(3 + 1 + 1 + 3);
    expect(ndefUrlMessageSize("https://www.a.b")).toBe(3 + 1 + 1 + 3);
  });

  it("fits both raw and encrypted card payloads on an NTAG213", () => {
    const raw = ndefUrlMessageSize(buildPaperWalletUrl(ORIGIN, KEY));
    const encrypted = ndefUrlMessageSize(buildPaperWalletUrl(ORIGIN, ENCRYPTED));
    expect(raw).toBe(92);
    expect(encrypted).toBe(84);
    expect(ndefMessageFits(raw, 144)).toBe(true);
    expect(ndefMessageFits(encrypted, 144)).toBe(true);
  });

  it("switches to a long record past 255 payload bytes", () => {
    expect(ndefUrlMessageSize(`https://${"a".repeat(300)}`)).toBe(1 + 1 + 4 + 1 + 301);
    expect(ndefMessageFits(141, 144)).toBe(true);
    expect(ndefMessageFits(142, 144)).toBe(false);
  });
});

describe("summarizeDurations", () => {
  it("reports nearest-rank percentiles", () => {
    expect(summarizeDurations([])).toEqual({ count: 0, p50: null, p95: null });
    const durations = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);
    expect(summarizeDurations(durations)).toEqual({ count: 20, p50: 100, p95: 190 });
  });
});
