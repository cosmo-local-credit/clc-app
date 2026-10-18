/**
 * Coarse location and camera bootstrap for visitors with no GPS fix.
 *
 * MapTiler's geolocation endpoint is designed for client-side consumption with
 * a publicly usable key, so it is called directly rather than through our
 * backend. `@maptiler/sdk` is deliberately not installed for one JSON fetch.
 *
 * An IP city can center a guest discovery radius. Country-derived results are
 * display-only map defaults and must never center a radius. Neither is persisted
 * as a device fix — only real `getCurrentPosition` successes are.
 */
type IPCameraSource = "ip-city" | "country-default";

export type IPCamera = {
  lat: number;
  lng: number;
  zoom: number;
  source: IPCameraSource;
};

type MapTilerIPLocation = {
  camera: IPCamera | null;
  country: string | null;
};

/** An IP city is coarse, so it gets a slightly wider camera than a real fix. */
const IP_CITY_ZOOM = 11;
const COUNTRY_DEFAULT_ZOOM = 12;

/**
 * Country defaults resolve to a representative city camera, not a geometric
 * country centroid, which is often empty land.
 */
const COUNTRY_CAMERAS: Record<string, { lat: number; lng: number }> = {
  KE: { lat: -1.2921, lng: 36.8219 }, // Nairobi
  TZ: { lat: -6.7924, lng: 39.2083 }, // Dar es Salaam
  UG: { lat: 0.3476, lng: 32.5825 }, // Kampala
  RW: { lat: -1.9441, lng: 30.0619 }, // Kigali
  RS: { lat: 44.7866, lng: 20.4489 }, // Belgrade
};

export const NAIROBI_DEFAULT_CAMERA: IPCamera = {
  ...COUNTRY_CAMERAS.KE,
  zoom: COUNTRY_DEFAULT_ZOOM,
  source: "country-default",
};

export async function resolveIPCamera(signal?: AbortSignal): Promise<IPCamera> {
  const mapTiler = await fetchMapTilerLocation(signal);
  if (mapTiler.camera) return mapTiler.camera;

  const country =
    mapTiler.country ?? (await fetchCloudflareCountry(signal)) ?? readDefaultCountry();
  return countryCamera(country);
}

/**
 * Resolves the ISO country supplied by the same IP sources as the map camera.
 *
 * This is deliberately a coarse suggestion, never a claim about where a person
 * lives. Consumers must keep the resulting choice editable.
 */
export async function resolveIPCountry(signal?: AbortSignal): Promise<string | null> {
  const mapTiler = await fetchMapTilerLocation(signal);
  return mapTiler.country ?? (await fetchCloudflareCountry(signal)) ?? readDefaultCountry();
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

function countryCamera(country: string | null): IPCamera {
  const camera = country ? COUNTRY_CAMERAS[country] : undefined;
  if (!camera) return NAIROBI_DEFAULT_CAMERA;
  return { ...camera, zoom: COUNTRY_DEFAULT_ZOOM, source: "country-default" };
}

function readDefaultCountry(): string | null {
  return normalizeCountryCode(readEnv("VITE_DEFAULT_COUNTRY"));
}

function readEnv(name: "VITE_MAPTILER_KEY" | "VITE_DEFAULT_COUNTRY"): string | null {
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
