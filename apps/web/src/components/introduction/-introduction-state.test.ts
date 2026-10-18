import Cookies from "js-cookie";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  localStorage.clear();
  Cookies.remove("clc_intro_seen", { path: "/" });
});

describe("introduction completion", () => {
  it("persists across reloads and uses the cookie if local storage is lost", async () => {
    let state = await import("./introduction-state");
    expect(state.hasSeenIntroduction()).toBe(false);
    state.completeIntroduction();
    expect(localStorage.getItem(state.INTRODUCTION_STORAGE_KEY)).toBe("done");
    expect(Cookies.get("clc_intro_seen")).toBe("done");
    localStorage.clear();
    vi.resetModules();
    state = await import("./introduction-state");
    expect(state.hasSeenIntroduction()).toBe(true);
  });

  it("uses local storage when the cookie is lost", async () => {
    let state = await import("./introduction-state");
    state.completeIntroduction();
    Cookies.remove("clc_intro_seen", { path: "/" });
    vi.resetModules();
    state = await import("./introduction-state");
    expect(state.hasSeenIntroduction()).toBe(true);
  });

  it("continues without throwing if both stores are blocked", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Cookies, "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Cookies, "set").mockImplementation(() => {
      throw new Error("blocked");
    });
    const state = await import("./introduction-state");
    expect(state.hasSeenIntroduction()).toBe(false);
    expect(() => state.completeIntroduction()).not.toThrow();
    expect(state.hasSeenIntroduction()).toBe(true);
  });

  it("does not intercept explicit setup, sign-in, imports, or transaction links", async () => {
    const { isIntroductionEntry: entry } = await import("./introduction-state");
    expect(entry("/", {}, "")).toBe(true);
    expect(entry("/onboarding", { step: "welcome", redirect: "/wallet/send" }, "")).toBe(true);
    for (const step of ["signin", "profile", "method", "card"])
      expect(entry("/onboarding", { step }, "")).toBe(false);
    expect(entry("/", {}, "private-key-import")).toBe(false);
    expect(entry("/", { scan: "payload" }, "")).toBe(false);
    expect(entry("/wallet/send", {}, "")).toBe(false);
  });
});
