import { useEffect } from "react";
import { create } from "zustand";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "clc.theme";

// Mirrors the --background token in styles.css for each scheme. Used for the
// PWA <meta name="theme-color">, which needs a concrete sRGB value (oklch is
// not reliably honored there across browsers).
const THEME_COLOR: Record<Theme, string> = {
  light: "#f2f2f2",
  dark: "#141414",
};

// Inline <head> script (as a string) injected in __root.tsx. Runs synchronously
// before first paint so the correct scheme is applied with no flash: read the
// stored choice, else autodetect prefers-color-scheme (seeding it for next
// time), then set the class / color-scheme / theme-color meta. Built from the
// same constants the store uses so the storage key and meta colours can't drift.
export const themeBootstrapScript =
  `(function(){try{` +
  `var k=${JSON.stringify(THEME_STORAGE_KEY)},s=localStorage.getItem(k),` +
  `t=s==="light"||s==="dark"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";` +
  `if(s!==t)localStorage.setItem(k,t);` +
  `var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;` +
  `var m=document.querySelector('meta[name="theme-color"]');` +
  `if(m)m.setAttribute("content",t==="dark"?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)})` +
  `}catch(e){}})();`;

export function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {}
  return "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

// Always starts at "light" so the server render and the React-rendered control
// value match on first paint. The visible app theme is already correct from the
// inline bootstrap script in __root.tsx; consumers hydrate the displayed value
// from readInitialTheme() in an effect after mount.
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "light",
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {}
      applyTheme(theme);
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));

// Reads the store theme and, after mount, syncs it to the scheme the bootstrap
// script already applied (the store defaults to "light" so SSR and the first
// client render match). Used by every theme control so they reflect reality.
export function useHydratedTheme() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  useEffect(() => {
    const initial = readInitialTheme();
    // Skip the write when the store already matches — avoids a redundant DOM /
    // localStorage write on every mount (the bootstrap script already applied it).
    if (initial !== useThemeStore.getState().theme) setTheme(initial);
  }, [setTheme]);
  return { theme, setTheme };
}
