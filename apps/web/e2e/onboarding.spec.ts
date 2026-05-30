// TEMPORARILY DISABLED — Playwright / BrowserStack tests commented out
/*
import { completeProfileStep, expect, gotoHydrated, test } from "./fixtures";

test.describe("onboarding", () => {
	test("does not advance when the form is empty", async ({ page }) => {
		await gotoHydrated(page, "/onboarding");
		await page.getByRole("button", { name: "Continue" }).click();

		// Still on the profile step — validation blocked the submit.
		await expect(
			page.getByRole("heading", { name: "Create your account" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Your paper wallet" }),
		).toBeHidden();
	});

	test("completes the profile and reaches the paper wallet step", async ({
		page,
	}) => {
		await completeProfileStep(page);

		await expect(
			page.getByRole("heading", { name: "Your paper wallet" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Download card" }),
		).toBeVisible();
	});
});
*/
