/**
 * Coarse camera bootstrap for visitors with no GPS fix.
 *
 * MapTiler's geolocation endpoint is designed for client-side consumption with
 * a publicly usable key, so it is called directly rather than through our
 * backend. `@maptiler/sdk` is deliberately not installed for one JSON fetch.
 *
 * The result is only ever a camera hint. A country-derived result is a rank-4
 * default, never a rank-3 city fix, and neither is ever persisted — only real
 * `getCurrentPosition` successes are.
 */
type IPCameraSource = "ip-city" | "country-default";

export type IPCamera = {
  lat: number;
  lng: number;
  zoom: number;
  source: IPCameraSource;
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
  const city = await fetchMapTilerCity(signal);
  if (city) return city;

  const country = (await fetchCloudflareCountry(signal)) ?? readDefaultCountry();
  return countryCamera(country);
}

async function fetchMapTilerCity(signal?: AbortSignal): Promise<IPCamera | null> {
  const key = readEnv("VITE_MAPTILER_KEY");
  if (!key) return null;

  try {
    const response = await fetch(
      `https://api.maptiler.com/geolocation/ip.json?key=${encodeURIComponent(key)}`,
      { signal },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

    const { latitude, longitude } = body as Record<string, unknown>;
    if (!isCoordinate(latitude, 90) || !isCoordinate(longitude, 180)) return null;

    return { lat: latitude, lng: longitude, zoom: IP_CITY_ZOOM, source: "ip-city" };
  } catch {
    return null;
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
      const code = value?.trim().toUpperCase();
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
  return readEnv("VITE_DEFAULT_COUNTRY")?.toUpperCase() ?? null;
}

function readEnv(name: "VITE_MAPTILER_KEY" | "VITE_DEFAULT_COUNTRY"): string | null {
  const value = import.meta.env[name] as string | undefined;
  return value?.trim() ? value.trim() : null;
}

function isCoordinate(value: unknown, bound: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -bound && value <= bound;
}
