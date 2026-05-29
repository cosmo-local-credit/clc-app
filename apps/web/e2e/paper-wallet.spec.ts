import { completeProfileStep, expect, onBrowserStack, test } from "./fixtures";

/**
 * The paper wallet preview is a CSS-scaled card. Its rendered box must line up
 * with the full-width controls below it — a regression here is what made the
 * card edges diverge from the Download button on viewports wider than ~430px.
 */
async function expectCardAlignsWithButton(
	page: Parameters<typeof completeProfileStep>[0],
): Promise<void> {
	const wrapper = page.locator('[data-slot="preview-wrapper"]');
	const button = page.getByRole("button", { name: "Download card" });

	const wrapperBox = await wrapper.boundingBox();
	const buttonBox = await button.boundingBox();
	expect(wrapperBox).not.toBeNull();
	expect(buttonBox).not.toBeNull();
	if (!wrapperBox || !buttonBox) return;

	// Left edge and width must match within sub-pixel rounding.
	expect(Math.abs(wrapperBox.x - buttonBox.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(wrapperBox.width - buttonBox.width)).toBeLessThanOrEqual(1);
}

test.describe("paper wallet", () => {
	// Device-agnostic invariant — runs on every real device and locally.
	test("card and download button share the same horizontal bounds", async ({
		page,
	}) => {
		await completeProfileStep(page);
		await expectCardAlignsWithButton(page);
	});

	// Real devices have a fixed viewport, so the width sweep is desktop-only.
	test("stays aligned across the mobile width range", async ({ page }) => {
		test.skip(onBrowserStack, "viewport sweep is desktop-only");

		await completeProfileStep(page);
		for (const width of [360, 390, 412, 430, 491]) {
			await page.setViewportSize({ width, height: 1091 });
			await expectCardAlignsWithButton(page);
		}
	});
});
