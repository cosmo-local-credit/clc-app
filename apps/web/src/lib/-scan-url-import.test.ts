import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useScanUrlImport } from "./scan-url-import";

const VALID_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ENCRYPTED_KEY = "6PYMvQX3P2CjYXVkxczC5ZbPyyiDgRJTZatN6uQUFgYhBbm7idLvfZWzao";

function setSearch(search: string) {
  window.history.pushState(null, "", `/signup${search}`);
}

function clearSearch() {
  window.history.pushState(null, "", "/");
}

beforeEach(() => {
  clearSearch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useScanUrlImport", () => {
  it("returns null pendingKey when no ?w= is present", () => {
    const { result } = renderHook(() => useScanUrlImport());
    expect(result.current.pendingKey).toBeNull();
    expect(result.current.pendingEncryptedKey).toBeNull();
  });

  it("returns null pendingKey for an invalid key in ?w=", () => {
    setSearch("?w=not-a-key");
    const { result } = renderHook(() => useScanUrlImport());
    expect(result.current.pendingKey).toBeNull();
    expect(result.current.pendingEncryptedKey).toBeNull();
  });

  it("cleans the URL even when the key is invalid", () => {
    setSearch("?w=not-a-key");
    const spy = vi.spyOn(history, "replaceState").mockImplementation(() => {});
    renderHook(() => useScanUrlImport());
    expect(spy).toHaveBeenCalledWith(null, "", expect.any(String));
  });

  it("sets pendingKey for a valid key instead of auto-connecting", () => {
    setSearch(`?w=${VALID_KEY}`);

    const { result } = renderHook(() => useScanUrlImport());

    expect(result.current.pendingKey).toBe(VALID_KEY);
  });

  it("sets pendingEncryptedKey when ?w= contains an encrypted paper wallet", () => {
    setSearch(`?w=${ENCRYPTED_KEY}`);

    const { result } = renderHook(() => useScanUrlImport());

    expect(result.current.pendingEncryptedKey).toBe(ENCRYPTED_KEY);
    expect(result.current.pendingKey).toBeNull();
  });

  it("clearPendingKey resets pendingKey to null", () => {
    setSearch(`?w=${VALID_KEY}`);

    const { result } = renderHook(() => useScanUrlImport());
    expect(result.current.pendingKey).toBe(VALID_KEY);

    act(() => {
      result.current.clearPendingKey();
    });
    expect(result.current.pendingKey).toBeNull();
  });

  it("clearPendingImport resets encrypted imports", () => {
    setSearch(`?w=${ENCRYPTED_KEY}`);

    const { result } = renderHook(() => useScanUrlImport());
    expect(result.current.pendingEncryptedKey).toBe(ENCRYPTED_KEY);

    act(() => {
      result.current.clearPendingImport();
    });
    expect(result.current.pendingEncryptedKey).toBeNull();
  });

  it("queuePendingKey replaces an encrypted import with a raw pending key", () => {
    setSearch(`?w=${ENCRYPTED_KEY}`);

    const { result } = renderHook(() => useScanUrlImport());

    act(() => {
      result.current.queuePendingKey(VALID_KEY);
    });
    expect(result.current.pendingEncryptedKey).toBeNull();
    expect(result.current.pendingKey).toBe(VALID_KEY);
  });

  it("cleans the URL when a valid key is found", () => {
    setSearch(`?w=${VALID_KEY}`);
    const spy = vi.spyOn(history, "replaceState").mockImplementation(() => {});

    renderHook(() => useScanUrlImport());

    expect(spy).toHaveBeenCalledWith(null, "", "/signup");
  });

  it("normalises a bare-hex key in ?w=", () => {
    const bareKey = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    setSearch(`?w=${bareKey}`);

    const { result } = renderHook(() => useScanUrlImport());

    expect(result.current.pendingKey).toBe(`0x${bareKey}`);
  });
});
