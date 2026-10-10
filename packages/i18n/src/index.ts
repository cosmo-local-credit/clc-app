import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";
import { messages as enMessages } from "./catalogs/en/messages.po";
import {
  DEFAULT_LOCALE,
  getLocaleDirection,
  getLocaleFormattingLocale,
  isSupportedLocale,
  matchSupportedLocale,
  type SupportedLocale,
} from "./locales";

export {
  DEFAULT_LOCALE,
  getLocaleDirection,
  isSupportedLocale,
  matchSupportedLocale,
  type SupportedLocale,
};

const catalogLoaders: Record<SupportedLocale, () => Promise<{ messages: Messages }>> = {
  ar: () => import("./catalogs/ar/messages.po"),
  de: () => import("./catalogs/de/messages.po"),
  dz: () => import("./catalogs/dz/messages.po"),
  en: async () => ({ messages: enMessages }),
  es: () => import("./catalogs/es/messages.po"),
  fil: () => import("./catalogs/fil/messages.po"),
  fr: () => import("./catalogs/fr/messages.po"),
  hi: () => import("./catalogs/hi/messages.po"),
  it: () => import("./catalogs/it/messages.po"),
  nl: () => import("./catalogs/nl/messages.po"),
  pt: () => import("./catalogs/pt/messages.po"),
  sr: () => import("./catalogs/sr/messages.po"),
  sw: () => import("./catalogs/sw/messages.po"),
  uk: () => import("./catalogs/uk/messages.po"),
  zh: () => import("./catalogs/zh/messages.po"),
  "zh-Hant": () => import("./catalogs/zh-Hant/messages.po"),
};

const loadedLocales = new Set<SupportedLocale>();
let activeSequence = 0;

i18n.loadAndActivate({
  locale: DEFAULT_LOCALE,
  locales: [getLocaleFormattingLocale(DEFAULT_LOCALE)],
  messages: enMessages,
});
loadedLocales.add(DEFAULT_LOCALE);

export { i18n };

export async function activateLocale(locale: SupportedLocale) {
  const sequence = ++activeSequence;

  if (!loadedLocales.has(locale)) {
    const catalog = await catalogLoaders[locale]();
    i18n.load(locale, catalog.messages);
    loadedLocales.add(locale);
  }

  if (sequence !== activeSequence) return;
  i18n.activate(locale, [getLocaleFormattingLocale(locale)]);
}
