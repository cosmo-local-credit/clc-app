import { describe, expect, it } from "vitest";
import { profileSchema } from "./logic";

// Minimal valid base — used as a template in tests that focus on one field.
const VALID_BASE = {
	name: "Alice",
	email: "alice@example.com",
	phone: "",
	country: "KE",
};

describe("profileSchema", () => {
	// ── Required fields ───────────────────────────────────────────────────────────

	it("accepts a fully populated object", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "alice@example.com",
				phone: "+254712345678",
				country: "KE",
			}).success,
		).toBe(true);
	});

	it("accepts name + email + country (no phone)", () => {
		expect(profileSchema.safeParse({ ...VALID_BASE, phone: "" }).success).toBe(
			true,
		);
	});

	it("accepts name + phone + country (no email)", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+254712345678",
				country: "KE",
			}).success,
		).toBe(true);
	});

	// ── name ─────────────────────────────────────────────────────────────────────

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

	// ── country ───────────────────────────────────────────────────────────────────

	it("rejects an empty country", () => {
		const result = profileSchema.safeParse({ ...VALID_BASE, country: "" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toMatch(/required/i);
		}
	});

	it("rejects a lowercase country code", () => {
		expect(
			profileSchema.safeParse({ ...VALID_BASE, country: "ke" }).success,
		).toBe(false);
	});

	it("rejects a three-letter country code", () => {
		expect(
			profileSchema.safeParse({ ...VALID_BASE, country: "KEN" }).success,
		).toBe(false);
	});

	it("accepts a valid ISO 3166-1 alpha-2 country code", () => {
		expect(
			profileSchema.safeParse({ ...VALID_BASE, country: "KE" }).success,
		).toBe(true);
	});

	// ── email OR phone required ────────────────────────────────────────────────────

	it("rejects when both email and phone are empty", () => {
		const result = profileSchema.safeParse({
			name: "Alice",
			email: "",
			phone: "",
			country: "KE",
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
				country: "KE",
			}).success,
		).toBe(true);
	});

	it("passes when only phone is provided", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+254712345678",
				country: "KE",
			}).success,
		).toBe(true);
	});

	it("passes when both email and phone are provided", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "alice@example.com",
				phone: "+254712345678",
				country: "KE",
			}).success,
		).toBe(true);
	});

	// ── email format ─────────────────────────────────────────────────────────────

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

	// ── phone format ─────────────────────────────────────────────────────────────

	it("accepts a valid E.164 phone number", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+254712345678",
				country: "KE",
			}).success,
		).toBe(true);
	});

	it("rejects a phone without a leading +", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "0712345678",
				country: "KE",
			}).success,
		).toBe(false);
	});

	it("rejects a phone with non-digits after the +", () => {
		expect(
			profileSchema.safeParse({
				name: "Alice",
				email: "",
				phone: "+abc12345",
				country: "KE",
			}).success,
		).toBe(false);
	});
});
