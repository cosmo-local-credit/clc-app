import { describe, expect, it } from "vitest";
import { locationSchema } from "./logic";

const VALID_LOCATION = {
	lat: -1.2921,
	lng: 36.8219,
	locationName: "Nairobi, Kenya",
	country: "KE",
};

describe("locationSchema", () => {
	it("accepts a valid reverse-geocoded location", () => {
		expect(locationSchema.safeParse(VALID_LOCATION).success).toBe(true);
	});

	it("rejects invalid latitude and longitude values", () => {
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, lat: -91 }).success,
		).toBe(false);
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, lat: 91 }).success,
		).toBe(false);
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, lng: -181 }).success,
		).toBe(false);
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, lng: 181 }).success,
		).toBe(false);
	});

	it("rejects empty place names", () => {
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, locationName: "   " })
				.success,
		).toBe(false);
	});

	it("rejects malformed country codes", () => {
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, country: "" }).success,
		).toBe(false);
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, country: "ke" }).success,
		).toBe(false);
		expect(
			locationSchema.safeParse({ ...VALID_LOCATION, country: "KEN" }).success,
		).toBe(false);
	});
});
