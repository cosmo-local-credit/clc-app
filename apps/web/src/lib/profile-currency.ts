import type { IsoCurrency } from "@clc/core/lib/currencies";

import { regionFromLocale, resolveIPCountry } from "#/lib/ip-geolocation-client";

export { regionFromLocale } from "#/lib/ip-geolocation-client";

/** A neutral fallback while the IP lookup is pending or has no country result. */
export const DEFAULT_PREFERRED_CURRENCY: IsoCurrency = "USD";

/**
 * Regions currently served by CLC, plus the common currencies a traveller is
 * most likely to bring to the app. The returned value is only a suggestion;
 * people always make the final choice in the profile form.
 */
const CURRENCY_BY_COUNTRY: Readonly<Record<string, IsoCurrency>> = {
  AU: "AUD",
  CA: "CAD",
  CH: "CHF",
  GB: "GBP",
  GH: "GHS",
  KE: "KES",
  NG: "NGN",
  RW: "RWF",
  RS: "RSD",
  TZ: "TZS",
  UG: "UGX",
  US: "USD",
  ZA: "ZAR",
  ZM: "ZMW",
  ZW: "ZWL",
  // Eurozone member states. A country is a better hint than a browser's
  // language: an English-speaking visitor in Germany should still see EUR.
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  HR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
};

export function preferredCurrencyForCountry(country: string | null | undefined): IsoCurrency {
  return CURRENCY_BY_COUNTRY[country?.trim().toUpperCase() ?? ""] ?? DEFAULT_PREFERRED_CURRENCY;
}

/**
 * The ISO country to start a profile from: IP first, then the device's regional
 * locale when offline or on a local network.
 *
 * Returned as a country rather than as one derived setting, because the same
 * answer seeds both the preferred currency and the phone field's dialling code.
 * Both stay editable — this is a convenience, never a claim about where a
 * person lives.
 */
export async function resolveProfileCountry(signal?: AbortSignal): Promise<string | null> {
  const country = await resolveIPCountry(signal);
  if (country) return country;
  return typeof navigator === "undefined" ? null : regionFromLocale(navigator.languages);
}
