import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BRAND_THEME_COLOR } from "#/lib/brand";

const { readInitialTheme, useThemeStore, themeBootstrapScript, THEME_STORAGE_KEY } =
  await import("./theme");

function mockPrefersColorScheme(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function ensureThemeColorMeta() {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", "");
}

describe("readInitialTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPrefersColorScheme(false);
  });

  it("returns the stored choice when present", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readInitialTheme()).toBe("dark");
  });

  it("autodetects dark from prefers-color-scheme when nothing is stored", () => {
    mockPrefersColorScheme(true);
    expect(readInitialTheme()).toBe("dark");
  });

  it("defaults to light when nothing is stored and the OS prefers light", () => {
    expect(readInitialTheme()).toBe("light");
  });
});

describe("useThemeStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
    ensureThemeColorMeta();
  });

  it("setTheme applies the class, persists, and updates the theme-color meta", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      BRAND_THEME_COLOR.dark,
    );
  });

  it("toggleTheme flips between light and dark", () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("light");
  });
});

describe("themeBootstrapScript", () => {
  it("embeds the shared storage key and theme-color values so they cannot drift", () => {
    expect(themeBootstrapScript).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(themeBootstrapScript).toContain(BRAND_THEME_COLOR.dark);
    expect(themeBootstrapScript).toContain(BRAND_THEME_COLOR.light);
  });
});
