import { describe, expect, it } from "vitest";
import { profileSchema } from "./logic";

describe("profileSchema", () => {
	// ── All fields empty → valid (all optional) ──────────────────────────────────

	it("accepts a fully empty object", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	// ── name ─────────────────────────────────────────────────────────────────────

	it("accepts a name within 80 characters", () => {
		const result = profileSchema.safeParse({
			name: "Alice",
			email: "",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a name longer than 80 characters", () => {
		const result = profileSchema.safeParse({
			name: "a".repeat(81),
			email: "",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const msg = result.error.issues[0]?.message ?? "";
			expect(msg).toMatch(/80/);
		}
	});

	it("accepts a name of exactly 80 characters", () => {
		const result = profileSchema.safeParse({
			name: "a".repeat(80),
			email: "",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	// ── email ─────────────────────────────────────────────────────────────────────

	it("accepts a valid email address", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "alice@example.com",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	it("accepts an empty email", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a malformed email address", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "not-an-email",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects an email without a domain", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "alice@",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(false);
	});

	// ── phone ─────────────────────────────────────────────────────────────────────

	it("accepts a valid E.164 phone number", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "+254712345678",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	it("accepts an empty phone", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a phone without a leading +", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "0712345678",
			country: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects a phone with non-digits after the +", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "+abc12345",
			country: "",
		});
		expect(result.success).toBe(false);
	});

	// ── country ───────────────────────────────────────────────────────────────────

	it("accepts a valid ISO 3166-1 alpha-2 country code", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "",
			country: "KE",
		});
		expect(result.success).toBe(true);
	});

	it("accepts an empty country", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "",
			country: "",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a lowercase country code", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "",
			country: "ke",
		});
		expect(result.success).toBe(false);
	});

	it("rejects a three-letter country code", () => {
		const result = profileSchema.safeParse({
			name: "",
			email: "",
			phone: "",
			country: "KEN",
		});
		expect(result.success).toBe(false);
	});

	// ── inferred type ────────────────────────────────────────────────────────────

	it("returns parsed values for a fully populated object", () => {
		const result = profileSchema.safeParse({
			name: "Alice",
			email: "alice@example.com",
			phone: "+254712345678",
			country: "KE",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({
				name: "Alice",
				email: "alice@example.com",
				phone: "+254712345678",
				country: "KE",
			});
		}
	});
});
