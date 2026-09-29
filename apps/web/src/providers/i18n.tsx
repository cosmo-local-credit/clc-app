import {
  activateLocale,
  DEFAULT_LOCALE,
  getLocaleDirection,
  i18n,
  isSupportedLocale,
  matchSupportedLocale,
  type SupportedLocale,
} from "@clc/i18n/index";
import { I18nProvider } from "@lingui/react";
import Cookies from "js-cookie";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const LOCALE_STORAGE_KEY = "clc.locale";
const LOCALE_COOKIE_NAME = "clc_locale";
const COOKIE_MAX_AGE_DAYS = 365;

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  loading: boolean;
  error: string | null;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readCookieLocale() {
  if (typeof document === "undefined") return null;
  try {
    return Cookies.get(LOCALE_COOKIE_NAME) ?? null;
  } catch {
    return null;
  }
}

function readLocalStorageLocale() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalStorageLocale(locale: SupportedLocale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {}
}

function writeCookieLocale(locale: SupportedLocale) {
  if (typeof document === "undefined") return;
  try {
    Cookies.set(LOCALE_COOKIE_NAME, locale, {
      expires: COOKIE_MAX_AGE_DAYS,
      path: "/",
      sameSite: "lax",
    });
  } catch {}
}

function readBrowserLocale(): SupportedLocale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const preferred =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
  return matchSupportedLocale(preferred);
}

function readStoredLocale(): SupportedLocale {
  const localValue = readLocalStorageLocale();
  if (isSupportedLocale(localValue)) return localValue;

  const cookieValue = readCookieLocale();
  if (isSupportedLocale(cookieValue)) return cookieValue;

  return readBrowserLocale();
}

function persistLocale(locale: SupportedLocale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDirection(locale);
  }

  writeLocalStorageLocale(locale);
  writeCookieLocale(locale);
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
  // Always start with DEFAULT_LOCALE so server and first client render match.
  // The stored preference is read in an effect after hydration.
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeLocaleRef = useRef<SupportedLocale>(DEFAULT_LOCALE);
  const rollbackRef = useRef(false);

  // Restore persisted locale after hydration to avoid server/client mismatch.
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== DEFAULT_LOCALE) setLocaleState(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isRollback = rollbackRef.current;
    rollbackRef.current = false;
    setLoading(true);
    if (!isRollback) setError(null);
    void activateLocale(locale)
      .then(() => {
        if (cancelled) return;
        activeLocaleRef.current = locale;
        persistLocale(locale);
      })
      .catch(() => {
        if (cancelled) return;
        rollbackRef.current = true;
        setError("Unable to load language. Reverted to English.");
        setLocaleState(activeLocaleRef.current);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, loading, error }),
    [locale, setLocale, loading, error],
  );

  return (
    <LocaleContext.Provider value={value}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within AppI18nProvider");
  }
  return context;
}
