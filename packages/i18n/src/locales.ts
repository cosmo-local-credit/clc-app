export const DEFAULT_LOCALE = "en";

const SUPPORTED_LOCALES = ["ar", "dz", "en", "es", "fr", "it", "pt", "sr", "sw"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleDirection = "ltr" | "rtl";

export type LocaleOption = {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
  direction: LocaleDirection;
  intlLocale: string;
};

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: "en", label: "English", nativeLabel: "English", direction: "ltr", intlLocale: "en" },
  {
    code: "ar",
    label: "Arabic",
    nativeLabel: "العربية",
    direction: "rtl",
    intlLocale: "ar-u-nu-arab",
  },
  {
    code: "dz",
    label: "Dzongkha",
    nativeLabel: "རྫོང་ཁ",
    direction: "ltr",
    intlLocale: "dz",
  },
  { code: "es", label: "Spanish", nativeLabel: "Español", direction: "ltr", intlLocale: "es" },
  { code: "fr", label: "French", nativeLabel: "Français", direction: "ltr", intlLocale: "fr" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", direction: "ltr", intlLocale: "it" },
  {
    code: "pt",
    label: "Portuguese",
    nativeLabel: "Português",
    direction: "ltr",
    intlLocale: "pt",
  },
  { code: "sr", label: "Serbian", nativeLabel: "Српски", direction: "ltr", intlLocale: "sr" },
  { code: "sw", label: "Kiswahili", nativeLabel: "Kiswahili", direction: "ltr", intlLocale: "sw" },
];

const LOCALE_METADATA = Object.fromEntries(
  LOCALE_OPTIONS.map(({ code, direction, intlLocale }) => [code, { direction, intlLocale }]),
) as Record<SupportedLocale, Pick<LocaleOption, "direction" | "intlLocale">>;

export function getLocaleDirection(locale: SupportedLocale): LocaleDirection {
  return LOCALE_METADATA[locale].direction;
}

export function getLocaleFormattingLocale(locale: SupportedLocale): string {
  return LOCALE_METADATA[locale].intlLocale;
}

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
