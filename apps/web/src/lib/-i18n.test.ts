import { activateLocale, i18n } from "@clc/i18n/index";
import { afterEach, describe, expect, it } from "vitest";

describe("i18n catalogs", () => {
	afterEach(async () => {
		await activateLocale("en");
	});

	it("activates the Kiswahili catalog on demand", async () => {
		await activateLocale("sw");

		expect(
			i18n._({ id: "Choose a location", message: "Choose a location" }),
		).toBe("Chagua eneo");
	});

	it("falls back to English as the base locale", async () => {
		await activateLocale("en");

		expect(
			i18n._({ id: "Choose a location", message: "Choose a location" }),
		).toBe("Choose a location");
	});
});
