import {
	activateLocale,
	DEFAULT_LOCALE,
	i18n,
	isSupportedLocale,
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

function readStoredLocale(): SupportedLocale {
	const localValue = readLocalStorageLocale();
	if (isSupportedLocale(localValue)) return localValue;

	const cookieValue = readCookieLocale();
	if (isSupportedLocale(cookieValue)) return cookieValue;

	return DEFAULT_LOCALE;
}

function persistLocale(locale: SupportedLocale) {
	if (typeof document !== "undefined") {
		document.documentElement.lang = locale;
	}

	writeLocalStorageLocale(locale);
	writeCookieLocale(locale);
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<SupportedLocale>(readStoredLocale);
	const [loading, setLoading] = useState(locale !== DEFAULT_LOCALE);
	const [error, setError] = useState<string | null>(null);
	const activeLocaleRef = useRef<SupportedLocale>(DEFAULT_LOCALE);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		void activateLocale(locale)
			.then(() => {
				if (cancelled) return;
				activeLocaleRef.current = locale;
				persistLocale(locale);
			})
			.catch(() => {
				if (cancelled) return;
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
