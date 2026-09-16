import { describe, expect, it } from "vite-plus/test";
import { detectPasskeyProvider, passkeyBlockedReason } from "./passkey-support";

const CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";
const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0";
const OPERA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/117.0.0.0";
const VIVALDI =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Vivaldi/7.1";

function env(overrides: Partial<Parameters<typeof passkeyBlockedReason>[0]> = {}) {
  return {
    hasWindow: true,
    isSecureContext: true,
    hasPublicKeyCredential: true,
    hasCredentialsGet: true,
    userAgent: CHROME,
    ...overrides,
  };
}

describe("detectPasskeyProvider", () => {
  it("maps Chrome to Google Password Manager", () => {
    expect(detectPasskeyProvider(CHROME)).toBe("google");
  });

  it("maps Safari to Apple ID", () => {
    // Safari's UA contains "Safari/" and "Version/" but never "Chrome/".
    expect(detectPasskeyProvider(SAFARI)).toBe("apple");
  });

  it.each([
    ["Edge", EDGE],
    ["Opera", OPERA],
    ["Vivaldi", VIVALDI],
  ])("rejects %s, which is Chromium but not Chrome", (_name, userAgent) => {
    // These have a platform authenticator (Windows Hello) but no access to the
    // account manager holding our passkeys, so the picker would come up empty.
    expect(detectPasskeyProvider(userAgent)).toBeNull();
  });

  it("rejects Firefox, which has no cloud-synced platform passkey provider", () => {
    expect(detectPasskeyProvider(FIREFOX)).toBeNull();
  });

  it("does not mistake Chrome for Safari on the strength of the Safari token", () => {
    // Chrome's UA ends in "Safari/537.36". Ordering the Safari check first
    // without the Chrome exclusion would label every Chrome install "apple".
    expect(detectPasskeyProvider(CHROME)).not.toBe("apple");
  });
});

describe("passkeyBlockedReason", () => {
  it("allows a supported browser through to the authenticator probe", () => {
    expect(passkeyBlockedReason(env())).toBeNull();
  });

  it("blocks an insecure context before anything else", () => {
    expect(passkeyBlockedReason(env({ isSecureContext: false }))).toBe("insecure-context");
  });

  it("blocks a browser with no WebAuthn at all", () => {
    expect(passkeyBlockedReason(env({ hasPublicKeyCredential: false }))).toBe("no-webauthn");
  });

  it("blocks a browser that exposes PublicKeyCredential but not credentials.get", () => {
    expect(passkeyBlockedReason(env({ hasCredentialsGet: false }))).toBe("no-webauthn");
  });

  it.each([
    ["Firefox", FIREFOX],
    ["Edge", EDGE],
    ["Opera", OPERA],
    ["Vivaldi", VIVALDI],
  ])("blocks %s as the wrong browser rather than as missing support", (_name, userAgent) => {
    expect(passkeyBlockedReason(env({ userAgent }))).toBe("wrong-browser");
  });

  it("blocks server-side rendering, where no navigator exists", () => {
    expect(passkeyBlockedReason(env({ hasWindow: false }))).toBe("no-webauthn");
  });
});
