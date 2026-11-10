import { regionFromLocale, resolveIPCountry } from "#/lib/ip-geolocation-client";

export { regionFromLocale } from "#/lib/ip-geolocation-client";
export {
  DEFAULT_PREFERRED_CURRENCY,
  preferredCurrencyForCountry,
} from "@clc/core/lib/country-currency";

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
