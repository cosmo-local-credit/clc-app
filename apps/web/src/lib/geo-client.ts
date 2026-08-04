export type GeocodeSuggestion = {
  address: string;
  lat: number;
  lng: number;
  score: number;
  country?: string;
};

export type ReverseGeocodeResult = {
  locationName: string;
  country: string;
};

type MapTilerCountryProperties = {
  country_code?: string;
};

type MapTilerContext = {
  country_code?: string;
};

type MapTilerFeature = {
  center?: [number, number];
  place_name?: string;
  text?: string;
  relevance?: number;
  properties?: MapTilerCountryProperties;
  context?: MapTilerContext[];
};

type MapTilerSearchResponse = {
  features?: MapTilerFeature[];
};

const MAPTILER_GEOCODE_URL = "https://api.maptiler.com/geocoding";

function mapTilerUrl(path: string, params: Record<string, string>): string | null {
  const key = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim();
  if (!key) return null;

  const search = new URLSearchParams({ ...params, key });
  return `${MAPTILER_GEOCODE_URL}/${path}.json?${search.toString()}`;
}

function normalizeCountryCode(code: string | undefined): string | undefined {
  const normalized = code?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

function featureCountry(feature: MapTilerFeature): string | undefined {
  const directCountry = normalizeCountryCode(feature.properties?.country_code);
  if (directCountry) return directCountry;

  for (const item of feature.context ?? []) {
    const contextCountry = normalizeCountryCode(item.country_code);
    if (contextCountry) return contextCountry;
  }

  return undefined;
}

function featureLabel(feature: MapTilerFeature): string | undefined {
  const label = feature.place_name?.trim() || feature.text?.trim();
  return label || undefined;
}

function featureScore(feature: MapTilerFeature): number {
  const relevance = feature.relevance ?? 0;
  return Math.round(Math.min(1, Math.max(0, relevance)) * 100);
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeSuggestion[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 3 || signal?.aborted) return [];

  try {
    const url = mapTilerUrl(encodeURIComponent(trimmedQuery), {
      language: "en",
      autocomplete: "true",
      limit: "5",
    });
    if (!url) return [];

    const response = await fetch(url, { method: "GET", signal });
    if (!response.ok) return [];

    const body = (await response.json()) as MapTilerSearchResponse;
    return (body.features ?? [])
      .map((feature): GeocodeSuggestion | null => {
        const [lng, lat] = feature.center ?? [];
        const address = featureLabel(feature);
        if (typeof lat !== "number" || typeof lng !== "number" || !address) return null;

        const country = featureCountry(feature);
        return {
          address,
          lat,
          lng,
          score: featureScore(feature),
          ...(country ? { country } : {}),
        };
      })
      .filter((feature): feature is GeocodeSuggestion => feature !== null);
  } catch {
    return [];
  }
}

export async function reverseLocation(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult | null> {
  if (signal?.aborted) return null;

  try {
    const url = mapTilerUrl(`${lng},${lat}`, {
      language: "en",
      limit: "1",
    });
    if (!url) return null;

    const response = await fetch(url, { method: "GET", signal });
    if (!response.ok) return null;

    const body = (await response.json()) as MapTilerSearchResponse;
    for (const feature of body.features ?? []) {
      const country = featureCountry(feature);
      const locationName = featureLabel(feature);
      if (country && locationName) return { locationName, country };
    }

    return null;
  } catch {
    return null;
  }
}
