export const DEFAULT_LOCALE = "en";

const SUPPORTED_LOCALES = ["en", "es", "fr", "sr", "sw"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleOption = {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
};

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "sr", label: "Serbian", nativeLabel: "Српски" },
  { code: "sw", label: "Kiswahili", nativeLabel: "Kiswahili" },
];

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

// Match an ordered list of preferred language tags (e.g. navigator.languages,
// ["sw-KE", "en-US", "en"]) to a supported locale by primary subtag.
// Tags are normalized first: trimmed and split on either "-" or "_", since
// navigator values can use underscores (e.g. "en_US") or carry whitespace.
// Returns DEFAULT_LOCALE when none match. First supported match wins.
export function matchSupportedLocale(preferred: readonly string[]): SupportedLocale {
  for (const tag of preferred) {
    const primary = tag.trim().split(/[-_]/)[0]?.toLowerCase();
    if (isSupportedLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
