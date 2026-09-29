import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";
import { messages as enMessages } from "./catalogs/en/messages.po";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  matchSupportedLocale,
  type SupportedLocale,
} from "./locales";

export { DEFAULT_LOCALE, isSupportedLocale, matchSupportedLocale, type SupportedLocale };

const catalogLoaders: Record<SupportedLocale, () => Promise<{ messages: Messages }>> = {
  en: async () => ({ messages: enMessages }),
  es: () => import("./catalogs/es/messages.po"),
  fr: () => import("./catalogs/fr/messages.po"),
  pt: () => import("./catalogs/pt/messages.po"),
  sr: () => import("./catalogs/sr/messages.po"),
  sw: () => import("./catalogs/sw/messages.po"),
};

const loadedLocales = new Set<SupportedLocale>();
let activeSequence = 0;

i18n.loadAndActivate({ locale: DEFAULT_LOCALE, messages: enMessages });
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
  i18n.activate(locale);
}
