import { describe, expect, it } from "vite-plus/test";
import { normalizePrivateKey } from "./private-key";

const VALID_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const BARE_KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("normalizePrivateKey", () => {
  it("accepts a valid 0x-prefixed private key", () => {
    const result = normalizePrivateKey(VALID_KEY);
    expect(result).toEqual({ ok: true, key: VALID_KEY });
  });

  it("accepts a bare 64-char hex key and normalizes to 0x-prefixed", () => {
    const result = normalizePrivateKey(BARE_KEY);
    expect(result).toEqual({ ok: true, key: VALID_KEY });
  });

  it("rejects an empty string", () => {
    const result = normalizePrivateKey("");
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects a short hex string", () => {
    const result = normalizePrivateKey("0x1234");
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects non-hex characters in a 64-char body", () => {
    const result = normalizePrivateKey(`0x${"g".repeat(64)}`);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects a random string that is neither hex nor 0x-prefixed", () => {
    const result = normalizePrivateKey("not-a-key");
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects the zero key", () => {
    expect(normalizePrivateKey(`0x${"0".repeat(64)}`)).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it("rejects a key at or above the secp256k1 group order", () => {
    const order = "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141";
    expect(normalizePrivateKey(`0x${order}`).ok).toBe(false);
    expect(normalizePrivateKey("f".repeat(64)).ok).toBe(false);
  });

  it("accepts the largest valid key, one below the group order", () => {
    const max = "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140";
    expect(normalizePrivateKey(max)).toEqual({ ok: true, key: `0x${max}` });
  });

  it("trims whitespace before validating", () => {
    const result = normalizePrivateKey(`  ${VALID_KEY}  `);
    expect(result).toEqual({ ok: true, key: VALID_KEY });
  });

  describe("URL extraction (v1 paper wallet format)", () => {
    it("extracts the key from a sarafu.network login URL with 0x-prefixed key", () => {
      const result = normalizePrivateKey(
        "https://sarafu.network/login?w=0xb69fd86789f654dc7407e3b2252eb5375b875d442acbbe426867bb19bd6da48f",
      );
      expect(result).toEqual({
        ok: true,
        key: "0xb69fd86789f654dc7407e3b2252eb5375b875d442acbbe426867bb19bd6da48f",
      });
    });

    it("extracts the key from a sarafu.network login URL with bare hex key", () => {
      const result = normalizePrivateKey(
        "https://sarafu.network/login?w=b69fd86789f654dc7407e3b2252eb5375b875d442acbbe426867bb19bd6da48f",
      );
      expect(result).toEqual({
        ok: true,
        key: "0xb69fd86789f654dc7407e3b2252eb5375b875d442acbbe426867bb19bd6da48f",
      });
    });

    it("rejects a sarafu.network URL with an invalid w parameter", () => {
      const result = normalizePrivateKey("https://sarafu.network/login?w=0x1234");
      expect(result).toEqual({ ok: false, error: expect.any(String) });
    });

    it("rejects a sarafu.network URL with no w parameter", () => {
      const result = normalizePrivateKey("https://sarafu.network/login");
      expect(result).toEqual({ ok: false, error: expect.any(String) });
    });

    it("rejects a random URL without the w parameter", () => {
      const result = normalizePrivateKey("https://example.com/page?foo=bar");
      expect(result).toEqual({ ok: false, error: expect.any(String) });
    });
  });
});
