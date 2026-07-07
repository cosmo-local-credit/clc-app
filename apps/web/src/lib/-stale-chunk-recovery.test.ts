import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { isModuleLoadError, reloadOnceForStaleChunk } from "./stale-chunk-recovery";

const IMPORT_ERROR = "Failed to fetch dynamically imported module: https://app/assets/home-page.js";

describe("isModuleLoadError", () => {
  it("matches the browser dynamic-import failure messages", () => {
    expect(isModuleLoadError(new Error(IMPORT_ERROR))).toBe(true);
    expect(isModuleLoadError(new Error("error loading dynamically imported module: x"))).toBe(true);
    expect(isModuleLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isModuleLoadError(IMPORT_ERROR)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isModuleLoadError(new Error("Network request failed"))).toBe(false);
    expect(isModuleLoadError(null)).toBe(false);
    expect(isModuleLoadError({ message: 123 })).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    window.name = "";
    vi.restoreAllMocks();
  });

  it("reloads once for a given chunk and reports it", () => {
    expect(reloadOnceForStaleChunk(new Error(IMPORT_ERROR))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a second time for the same chunk", () => {
    reloadOnceForStaleChunk(new Error(IMPORT_ERROR));
    reload.mockClear();

    expect(reloadOnceForStaleChunk(new Error(IMPORT_ERROR))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads again for a different chunk (a later deploy)", () => {
    reloadOnceForStaleChunk(new Error(IMPORT_ERROR));
    reload.mockClear();

    const nextDeploy =
      "Failed to fetch dynamically imported module: https://app/assets/home-page.NEW.js";
    expect(reloadOnceForStaleChunk(new Error(nextDeploy))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not boot-loop when sessionStorage is unavailable (window.name fallback)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(reloadOnceForStaleChunk(new Error(IMPORT_ERROR))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.name).toContain(IMPORT_ERROR);

    reload.mockClear();
    expect(reloadOnceForStaleChunk(new Error(IMPORT_ERROR))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
