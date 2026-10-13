export const DEFAULT_LOCALE = "en";

const SUPPORTED_LOCALES = [
  "ar",
  "de",
  "dz",
  "en",
  "es",
  "fil",
  "fr",
  "hi",
  "it",
  "nl",
  "nl-BE",
  "pt",
  "sr",
  "sw",
  "uk",
  "zh",
  "zh-Hant",
] as const;

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
    code: "zh",
    label: "Chinese (Simplified)",
    nativeLabel: "中文（简体）",
    direction: "ltr",
    intlLocale: "zh-CN",
  },
  {
    code: "zh-Hant",
    label: "Chinese (Traditional)",
    nativeLabel: "中文（繁體）",
    direction: "ltr",
    intlLocale: "zh-Hant",
  },
  {
    code: "dz",
    label: "Dzongkha",
    nativeLabel: "རྫོང་ཁ",
    direction: "ltr",
    intlLocale: "dz",
  },
  { code: "de", label: "German", nativeLabel: "Deutsch", direction: "ltr", intlLocale: "de" },
  { code: "es", label: "Spanish", nativeLabel: "Español", direction: "ltr", intlLocale: "es" },
  {
    code: "fil",
    label: "Filipino",
    nativeLabel: "Filipino",
    direction: "ltr",
    intlLocale: "fil-PH",
  },
  { code: "fr", label: "French", nativeLabel: "Français", direction: "ltr", intlLocale: "fr" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", direction: "ltr", intlLocale: "hi" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", direction: "ltr", intlLocale: "it" },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands", direction: "ltr", intlLocale: "nl" },
  {
    code: "nl-BE",
    label: "Flemish",
    nativeLabel: "Vlaams",
    direction: "ltr",
    intlLocale: "nl-BE",
  },
  {
    code: "pt",
    label: "Portuguese",
    nativeLabel: "Português",
    direction: "ltr",
    intlLocale: "pt",
  },
  { code: "sr", label: "Serbian", nativeLabel: "Српски", direction: "ltr", intlLocale: "sr" },
  {
    code: "uk",
    label: "Ukrainian",
    nativeLabel: "Українська",
    direction: "ltr",
    intlLocale: "uk",
  },
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

const SIMPLIFIED_CHINESE_REGIONS = new Set(["cn", "sg", "my"]);
const TRADITIONAL_CHINESE_REGIONS = new Set(["tw", "hk", "mo"]);

function matchChineseLocale(parts: readonly string[]): "zh" | "zh-Hant" | undefined {
  if (parts.length === 1) return "zh";

  const subtags = parts.slice(1);
  const script = subtags.find((subtag) => subtag === "hans" || subtag === "hant");
  if (script === "hans") return "zh";
  if (script === "hant") return "zh-Hant";
  if (subtags.some((subtag) => TRADITIONAL_CHINESE_REGIONS.has(subtag))) return "zh-Hant";
  if (subtags.some((subtag) => SIMPLIFIED_CHINESE_REGIONS.has(subtag))) return "zh";
  return undefined;
}

// Match an ordered list of preferred language tags (e.g. navigator.languages,
// ["sw-KE", "en-US", "en"]) to a supported locale. Chinese is resolved by
// script and region, with an explicit script taking precedence over region.
// Belgian Dutch is resolved separately from generic Dutch. Other tags retain
// primary-subtag matching. Tags are normalized first because navigator values
// can contain underscores, mixed case, or surrounding whitespace. First
// supported match wins.
export function matchSupportedLocale(preferred: readonly string[]): SupportedLocale {
  for (const tag of preferred) {
    const parts = tag.trim().toLowerCase().split(/[-_]/).filter(Boolean);
    const primary = parts[0];
    if (primary === "zh") {
      const locale = matchChineseLocale(parts);
      if (locale) return locale;
      continue;
    }
    if (primary === "nl") {
      return parts.slice(1, 3).includes("be") ? "nl-BE" : "nl";
    }
    if (primary === "tl") return "fil";
    if (isSupportedLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
