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

const API_URL: string =
	(import.meta.env.VITE_API_URL as string | undefined) ??
	"http://192.168.1.20:5003";

function apiUrl(path: string, params: Record<string, string>): string {
	const search = new URLSearchParams(params);
	return `${API_URL}${path}?${search.toString()}`;
}

async function readResult<T>(response: Response): Promise<T | null> {
	if (!response.ok) return null;
	const body = (await response.json()) as { ok?: boolean; result?: T } | T;
	if (
		body &&
		typeof body === "object" &&
		"ok" in body &&
		(body as { ok?: boolean }).ok !== true
	) {
		return null;
	}
	if (body && typeof body === "object" && "result" in body) {
		return (body as { result?: T }).result ?? null;
	}
	return body as T;
}

export async function searchLocations(
	query: string,
	signal?: AbortSignal,
): Promise<GeocodeSuggestion[]> {
	try {
		const response = await fetch(apiUrl("/geo/search", { q: query }), {
			method: "GET",
			signal,
		});
		const result = await readResult<GeocodeSuggestion[]>(response);
		return result ?? [];
	} catch {
		return [];
	}
}

export async function reverseLocation(
	lat: number,
	lng: number,
	signal?: AbortSignal,
): Promise<ReverseGeocodeResult | null> {
	try {
		const response = await fetch(
			apiUrl("/geo/reverse", { lat: String(lat), lng: String(lng) }),
			{ method: "GET", signal },
		);
		return await readResult<ReverseGeocodeResult>(response);
	} catch {
		return null;
	}
}
