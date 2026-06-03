export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = ["en", "sw"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleOption = {
	code: SupportedLocale;
	label: string;
	nativeLabel: string;
};

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
	{ code: "en", label: "English", nativeLabel: "English" },
	{ code: "sw", label: "Kiswahili", nativeLabel: "Kiswahili" },
];

export function isSupportedLocale(
	value: string | null | undefined,
): value is SupportedLocale {
	return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}
