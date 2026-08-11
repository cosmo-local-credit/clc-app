import { useEffect } from "react";
import { create } from "zustand";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "clc.admin.theme";

// Inline <head> script (as a string) injected in __root.tsx. Runs synchronously
// before first paint so the correct scheme is applied with no flash: read the
// stored choice, else autodetect prefers-color-scheme (seeding it for next
// time), then set the class and color-scheme.
//
// Distinct storage key from apps/web on purpose — an operator's console
// preference is independent of their preference in the user-facing app.
export const themeBootstrapScript =
  `(function(){try{` +
  `var k=${JSON.stringify(THEME_STORAGE_KEY)},s=localStorage.getItem(k),` +
  `t=s==="light"||s==="dark"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";` +
  `if(s!==t)localStorage.setItem(k,t);` +
  `var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t` +
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
}

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

// Always starts at "light" so the server render and the first client render
// agree. The visible theme is already correct from the inline bootstrap script;
// consumers hydrate the displayed value via useHydratedTheme after mount.
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

export function useHydratedTheme() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  useEffect(() => {
    const initial = readInitialTheme();
    if (initial !== useThemeStore.getState().theme) setTheme(initial);
  }, [setTheme]);
  return { theme, setTheme };
}
