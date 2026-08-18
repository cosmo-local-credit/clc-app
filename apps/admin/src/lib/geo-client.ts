/**
 * Reverse geocoding for the account location picker.
 *
 * A trimmed port of `apps/web/src/lib/geo-client.ts`. Two differences, both
 * deliberate: this returns the place name only — the console edits an account's
 * country through its own field, so there is no alpha-3 to alpha-2 conversion and
 * therefore no `i18n-iso-countries` dependency — and there is no forward search,
 * because an operator here places a pin rather than typing a place.
 *
 * ArcGIS's World Geocoder is called straight from the browser, which the project's
 * backend boundary allows for exactly this shape of service: a public API designed
 * for client-side use, with no secret to protect. `forStorage=false` is what keeps
 * that within ArcGIS's free tier terms — the result is shown to the operator, and
 * what is stored is the name they then save, not the geocode response.
 */

const ARCGIS_GEOCODE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

type ArcgisReverseResponse = {
  address?: {
    Match_addr?: string;
    LongLabel?: string;
    ShortLabel?: string;
    CntryName?: string;
  };
};

/**
 * The place at a point, or null when there is nothing usable there.
 *
 * Null covers every failure the same way — offline, rate limited, a pin in the
 * middle of an ocean — because the caller's response to all of them is identical:
 * do not save a name that does not describe the pin.
 */
export async function reverseLocation(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) return null;

  const search = new URLSearchParams({
    f: "json",
    location: `${lng},${lat}`,
    langCode: "en",
    forStorage: "false",
  });

  try {
    const response = await fetch(`${ARCGIS_GEOCODE_URL}/reverseGeocode?${search.toString()}`, {
      method: "GET",
      signal,
    });
    if (!response.ok) return null;

    const body = (await response.json()) as ArcgisReverseResponse;
    const address = body.address;
    return formatLocationName(
      address?.Match_addr ?? address?.ShortLabel ?? address?.LongLabel,
      address?.CntryName,
    );
  } catch {
    return null;
  }
}

/**
 * "Kilifi, Kenya" rather than "Kilifi" — an operator reading one account's place
 * has no other context for it. The country is appended only when the primary label
 * does not already carry it, which ArcGIS's longer labels often do.
 */
function formatLocationName(
  primary: string | undefined,
  countryName: string | undefined,
): string | null {
  const trimmedPrimary = primary?.trim();
  const trimmedCountry = countryName?.trim();
  if (!trimmedPrimary) return trimmedCountry || null;
  if (!trimmedCountry) return trimmedPrimary;
  if (trimmedPrimary.toLowerCase().includes(trimmedCountry.toLowerCase())) {
    return trimmedPrimary;
  }
  return `${trimmedPrimary}, ${trimmedCountry}`;
}
