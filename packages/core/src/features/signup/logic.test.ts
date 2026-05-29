import { describe, expect, it } from "vitest";
import { profileSchema } from "./logic";

const VALID_LOCATION = {
	lat: -1.2921,
	lng: 36.8219,
	locationName: "Nairobi, Kenya",
	country: "KE",
};

const VALID_BASE = {
	name: "Alice",
	email: "alice@example.com",
	phone: "",
	location: VALID_LOCATION,
};

describe("profileSchema", () => {
	it("accepts a fully populated object", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "alice@example.com",
				phone: "+254712345678",
				location: VALID_LOCATION,
			}).success,
		).toBe(true);
	});

	it("accepts name + email + location (no phone)", () => {
		expect(profileSchema.safeParse({ ...VALID_BASE, phone: "" }).success).toBe(
			true,
		);
	});

	it("accepts name + phone + location (no email)", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+254712345678",
				location: VALID_LOCATION,
			}).success,
		).toBe(true);
	});

	it("rejects an empty name", () => {
		const result = profileSchema.safeParse({ ...VALID_BASE, name: "" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toMatch(/required/i);
		}
	});

	it("rejects a name longer than 80 characters", () => {
		const result = profileSchema.safeParse({
			...VALID_BASE,
			name: "a".repeat(81),
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toMatch(/80/);
		}
	});

	it("accepts a name of exactly 80 characters", () => {
		expect(
			profileSchema.safeParse({ ...VALID_BASE, name: "a".repeat(80) }).success,
		).toBe(true);
	});

	it("rejects a missing location with a user-facing message", () => {
		const result = profileSchema.safeParse({
			name: "Alice",
			email: "alice@example.com",
			phone: "",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("Choose a location");
		}
	});

	it("rejects an invalid location country code", () => {
		expect(
			profileSchema.safeParse({
				...VALID_BASE,
				location: { ...VALID_LOCATION, country: "KEN" },
			}).success,
		).toBe(false);
	});

	it("rejects when both email and phone are empty", () => {
		const result = profileSchema.safeParse({
			name: "Alice",
			email: "",
			phone: "",
			location: VALID_LOCATION,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const msgs = result.error.issues.map((i) => i.message);
			expect(msgs.some((m) => /email|phone/i.test(m))).toBe(true);
		}
	});

	it("passes when only email is provided", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "alice@example.com",
				phone: "",
				location: VALID_LOCATION,
			}).success,
		).toBe(true);
	});

	it("passes when only phone is provided", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+254712345678",
				location: VALID_LOCATION,
			}).success,
		).toBe(true);
	});

	it("passes when both email and phone are provided", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "alice@example.com",
				phone: "+254712345678",
				location: VALID_LOCATION,
			}).success,
		).toBe(true);
	});

	it("rejects a malformed email", () => {
		expect(
			profileSchema.safeParse({ ...VALID_BASE, email: "not-an-email" }).success,
		).toBe(false);
	});

	it("rejects an email without a domain", () => {
		expect(
			profileSchema.safeParse({ ...VALID_BASE, email: "alice@" }).success,
		).toBe(false);
	});

	it("accepts a valid E.164 phone number", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+254712345678",
				location: VALID_LOCATION,
			}).success,
		).toBe(true);
	});

	it("rejects a phone without a leading +", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "0712345678",
				location: VALID_LOCATION,
			}).success,
		).toBe(false);
	});

	it("rejects a phone with non-digits after the +", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+abc12345",
				location: VALID_LOCATION,
			}).success,
		).toBe(false);
	});
});
