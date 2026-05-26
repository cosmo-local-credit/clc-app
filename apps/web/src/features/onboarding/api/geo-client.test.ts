import { afterEach, describe, expect, it, vi } from "vitest";
import { reverseLocation, searchLocations } from "./geo-client";

const API_URL = "http://192.168.1.20:5003";

function mockFetch(body: unknown, status = 200) {
	return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		}),
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("searchLocations", () => {
	it("GETs /geo/search with an encoded query and abort signal", async () => {
		const signal = new AbortController().signal;
		const spy = mockFetch({
			ok: true,
			result: [
				{ address: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219, score: 99 },
			],
		});

		const result = await searchLocations("Nairobi CBD", signal);

		expect(spy).toHaveBeenCalledWith(
			`${API_URL}/geo/search?q=Nairobi+CBD`,
			expect.objectContaining({ method: "GET", signal }),
		);
		expect(result).toEqual([
			{ address: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219, score: 99 },
		]);
	});

	it("returns an empty list when search fails", async () => {
		mockFetch({ ok: false, description: "provider failed" }, 502);
		await expect(searchLocations("Nairobi")).resolves.toEqual([]);
	});
});

describe("reverseLocation", () => {
	it("GETs /geo/reverse with lat/lng and abort signal", async () => {
		const signal = new AbortController().signal;
		const spy = mockFetch({
			ok: true,
			result: { locationName: "Nairobi, Kenya", country: "KE" },
		});

		const result = await reverseLocation(-1.2921, 36.8219, signal);

		expect(spy).toHaveBeenCalledWith(
			`${API_URL}/geo/reverse?lat=-1.2921&lng=36.8219`,
			expect.objectContaining({ method: "GET", signal }),
		);
		expect(result).toEqual({ locationName: "Nairobi, Kenya", country: "KE" });
	});

	it("returns null when reverse geocoding fails", async () => {
		mockFetch({ ok: false, description: "no country" }, 422);
		await expect(reverseLocation(0, 0)).resolves.toBeNull();
	});
});
