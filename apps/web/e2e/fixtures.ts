// TEMPORARILY DISABLED — Playwright / BrowserStack tests commented out
/*
import { test as base, type Page } from "@playwright/test";

/** True when the run is driven by the browserstack-node-sdk wrapper. */
export const onBrowserStack = process.env.BROWSERSTACK === "1";

/**
 * Navigate and wait for the client to hydrate.
 *
 * TanStack Start streams the SSR response, so the document never reaches
 * `load`/`domcontentloaded` — navigate with `commit` instead. Then block until
 * hydration finishes: typing into a controlled input before React attaches its
 * listeners updates the DOM but not component state, so the search never fires.
 * TanStack flips `window.$_TSR.hydrated` (and later deletes `$_TSR`) on hydrate.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
	await page.goto(path, { waitUntil: "commit" });
	await page.waitForFunction(
		() => {
			const tsr = (window as unknown as { $_TSR?: { hydrated?: boolean } })
				.$_TSR;
			return tsr == null || tsr.hydrated === true;
		},
		null,
		{ timeout: 20_000 },
	);
}

/**
 * Fills the onboarding profile form and advances to the paper wallet step.
 *
 * The location field is geocoder-backed (ArcGIS World Geocoder), so the helper
 * types a query, waits for the suggestion listbox, picks the first result, then
 * waits for the reverse-geocode to resolve before submitting — otherwise the
 * form has no valid location and Continue won't advance.
 */
export async function completeProfileStep(page: Page): Promise<void> {
	await gotoHydrated(page, "/onboarding");

	await page.getByLabel("Name").fill("Test User");
	await page.getByLabel("Email").fill("test@example.com");

	// Real keystrokes — fill() can bypass the controlled input's onChange.
	const search = page.getByRole("searchbox", { name: "Location" });
	await search.click();
	await search.pressSequentially("Nairobi", { delay: 60 });

	const firstSuggestion = page.getByRole("option").first();
	await firstSuggestion.waitFor({ state: "visible", timeout: 15_000 });
	await firstSuggestion.click();

	// Reverse geocode runs after the pin is placed; wait for it to settle.
	await page
		.getByText(/Identifying location/)
		.waitFor({ state: "hidden", timeout: 15_000 })
		.catch(() => undefined);

	await page.getByRole("button", { name: "Continue" }).click();
	await page
		.getByRole("heading", { name: "Your paper wallet" })
		.waitFor({ state: "visible", timeout: 15_000 });
}

/**
 * Base test extended to report pass/fail back to the BrowserStack dashboard via
 * the browserstack_executor channel. No-op on local runs.
 */
export const test = base.extend({
	page: async ({ page }, use, testInfo) => {
		await use(page);

		if (!onBrowserStack) return;

		const passed = testInfo.status === testInfo.expectedStatus;
		const payload = {
			action: "setSessionStatus",
			arguments: {
				status: passed ? "passed" : "failed",
				reason: passed ? "Test passed" : (testInfo.error?.message ?? "failed"),
			},
		};
		await page
			.evaluate(
				() => undefined,
				`browserstack_executor: ${JSON.stringify(payload)}`,
			)
			.catch(() => undefined);
	},
});

export { expect } from "@playwright/test";
*/
