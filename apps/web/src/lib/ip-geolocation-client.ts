/**
 * Coarse location and camera bootstrap for visitors with no GPS fix.
 *
 * MapTiler's geolocation endpoint is designed for client-side consumption with
 * a publicly usable key, so it is called directly rather than through our
 * backend. `@maptiler/sdk` is deliberately not installed for one JSON fetch.
 *
 * A resolved hint can centre the Marketplace before the visitor interacts. It
 * is never a real position: only `getCurrentPosition` or a saved profile may
 * produce a distance or a "you are here" marker.
 */
export type IPCamera = {
  lat: number;
  lng: number;
  zoom: number;
  source: "ip-city";
  country?: string;
};

type MapTilerIPLocation = {
  camera: IPCamera | null;
  country: string | null;
};

/** An IP city is coarse, so it gets a wider camera than a real fix. */
const IP_CITY_ZOOM = 11;

export async function resolveIPCamera(signal?: AbortSignal): Promise<IPCamera | null> {
  const mapTiler = await fetchMapTilerLocation(signal);
  return mapTiler.camera
    ? {
        ...mapTiler.camera,
        ...(mapTiler.country ? { country: mapTiler.country } : {}),
      }
    : null;
}

/**
 * Resolves the ISO country supplied by the same IP sources as the map camera.
 *
 * This is deliberately a coarse suggestion, never a claim about where a person
 * lives. Consumers must keep the resulting choice editable.
 */
export async function resolveIPCountry(signal?: AbortSignal): Promise<string | null> {
  const mapTiler = await fetchMapTilerLocation(signal);
  const ipCountry = mapTiler.country ?? (await fetchCloudflareCountry(signal));
  if (ipCountry) return ipCountry;

  return regionFromLocale(readDeviceLanguages());
}

export function regionFromLocale(languages: readonly string[] | undefined): string | null {
  for (const language of languages ?? []) {
    try {
      const region = new Intl.Locale(language).region;
      if (region) return region.toUpperCase();
    } catch {
      // Malformed browser locale entries are ignored independently.
    }
  }
  return null;
}

function readDeviceLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

async function fetchMapTilerLocation(signal?: AbortSignal): Promise<MapTilerIPLocation> {
  const key = readEnv("VITE_MAPTILER_KEY");
  if (!key) return { camera: null, country: null };

  try {
    const response = await fetch(
      `https://api.maptiler.com/geolocation/ip.json?key=${encodeURIComponent(key)}`,
      { signal },
    );
    if (!response.ok) return { camera: null, country: null };

    const body = (await response.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { camera: null, country: null };
    }

    const { latitude, longitude, country_code: countryCode } = body as Record<string, unknown>;
    const country = normalizeCountryCode(countryCode);
    if (!isCoordinate(latitude, 90) || !isCoordinate(longitude, 180)) {
      return { camera: null, country };
    }

    return {
      camera: { lat: latitude, lng: longitude, zoom: IP_CITY_ZOOM, source: "ip-city" },
      country,
    };
  } catch {
    return { camera: null, country: null };
  }
}

async function fetchCloudflareCountry(signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch("/cdn-cgi/trace", { signal });
    if (!response.ok) return null;

    const trace = await response.text();
    for (const line of trace.split("\n")) {
      const [field, value] = line.split("=");
      if (field?.trim() !== "loc") continue;
      const code = normalizeCountryCode(value);
      // Cloudflare emits XX / T1 when it cannot determine a country.
      if (!code || code === "XX" || code === "T1") return null;
      return code;
    }
    return null;
  } catch {
    return null;
  }
}

function readEnv(name: "VITE_MAPTILER_KEY"): string | null {
  const value = import.meta.env[name] as string | undefined;
  return value?.trim() ? value.trim() : null;
}

function isCoordinate(value: unknown, bound: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -bound && value <= bound;
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const country = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}
