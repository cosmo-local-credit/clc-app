import { activateLocale, i18n } from "@clc/i18n/index";
import { afterEach, describe, expect, it } from "vitest";
import { translateValidationError } from "./validation-i18n";

const knownErrors = [
	"Name is required",
	"Name must be 80 characters or fewer",
	"Invalid email address",
	"Invalid phone number",
	"Provide an email or phone number",
	"Choose a location",
	"Invalid location",
] as const;

describe("translateValidationError", () => {
	afterEach(async () => {
		await activateLocale("en");
	});

	it("translates known validation errors with the active catalog", async () => {
		await activateLocale("sw");

		expect(translateValidationError("Choose a location", i18n)).toBe(
			"Chagua eneo",
		);
		expect(translateValidationError("Invalid phone number", i18n)).toBe(
			"Nambari ya simu si sahihi",
		);
	});

	it("keeps every known validation error wired to a catalog message", async () => {
		await activateLocale("en");

		for (const error of knownErrors) {
			expect(translateValidationError(error, i18n)).toBe(error);
		}
	});

	it("returns unknown errors unchanged", async () => {
		await activateLocale("sw");

		expect(translateValidationError("Server rejected signup", i18n)).toBe(
			"Server rejected signup",
		);
	});
});
