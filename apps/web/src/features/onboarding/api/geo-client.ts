import countries from "i18n-iso-countries";

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

type ArcgisCandidate = {
	address?: string;
	location?: { x?: number; y?: number };
	score?: number;
	attributes?: {
		Match_addr?: string;
		LongLabel?: string;
		ShortLabel?: string;
		Country?: string;
		CntryName?: string;
	};
};

type ArcgisSearchResponse = {
	candidates?: ArcgisCandidate[];
};

type ArcgisReverseResponse = {
	address?: {
		Match_addr?: string;
		LongLabel?: string;
		ShortLabel?: string;
		CountryCode?: string;
		CntryName?: string;
	};
};

const ARCGIS_GEOCODE_URL =
	"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

function arcgisUrl(operation: string, params: Record<string, string>): string {
	const search = new URLSearchParams({ f: "json", ...params });
	return `${ARCGIS_GEOCODE_URL}/${operation}?${search.toString()}`;
}

function normalizeCountryCode(code: string | undefined): string | undefined {
	const normalized = code?.trim().toUpperCase();
	if (!normalized) return undefined;
	if (/^[A-Z]{2}$/.test(normalized)) return normalized;
	if (/^[A-Z]{3}$/.test(normalized)) {
		return countries.alpha3ToAlpha2(normalized) ?? undefined;
	}
	return undefined;
}

function formatLocationName(
	primary: string | undefined,
	countryName: string | undefined,
): string | undefined {
	const trimmedPrimary = primary?.trim();
	const trimmedCountry = countryName?.trim();
	if (!trimmedPrimary) return trimmedCountry || undefined;
	if (!trimmedCountry) return trimmedPrimary;
	if (trimmedPrimary.toLowerCase().includes(trimmedCountry.toLowerCase())) {
		return trimmedPrimary;
	}
	return `${trimmedPrimary}, ${trimmedCountry}`;
}

export async function searchLocations(
	query: string,
	signal?: AbortSignal,
): Promise<GeocodeSuggestion[]> {
	const trimmedQuery = query.trim();
	if (trimmedQuery.length < 3 || signal?.aborted) return [];

	try {
		const response = await fetch(
			arcgisUrl("findAddressCandidates", {
				SingleLine: trimmedQuery,
				outFields: "Match_addr,LongLabel,ShortLabel,Country,CntryName",
				maxLocations: "5",
			}),
			{ method: "GET", signal },
		);
		if (!response.ok) return [];

		const body = (await response.json()) as ArcgisSearchResponse;
		return (body.candidates ?? [])
			.map((candidate) => {
				const lat = candidate.location?.y;
				const lng = candidate.location?.x;
				if (typeof lat !== "number" || typeof lng !== "number") return null;

				const address =
					formatLocationName(
						candidate.attributes?.Match_addr ??
							candidate.address ??
							candidate.attributes?.ShortLabel ??
							candidate.attributes?.LongLabel,
						candidate.attributes?.CntryName,
					) ?? candidate.address;
				if (!address) return null;

				return {
					address,
					lat,
					lng,
					score: candidate.score ?? 0,
					country: normalizeCountryCode(candidate.attributes?.Country),
				};
			})
			.filter(
				(candidate): candidate is GeocodeSuggestion => candidate !== null,
			);
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
		const response = await fetch(
			arcgisUrl("reverseGeocode", {
				location: `${lng},${lat}`,
				langCode: "en",
				forStorage: "false",
			}),
			{ method: "GET", signal },
		);
		if (!response.ok) return null;

		const body = (await response.json()) as ArcgisReverseResponse;
		const country = normalizeCountryCode(body.address?.CountryCode);
		const locationName = formatLocationName(
			body.address?.Match_addr ??
				body.address?.ShortLabel ??
				body.address?.LongLabel,
			body.address?.CntryName,
		);

		if (!country || !locationName) return null;
		return { locationName, country };
	} catch {
		return null;
	}
}
