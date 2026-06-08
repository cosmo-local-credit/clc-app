/**
 * Paper wallet — card rendering and alignment invariants.
 *
 * The paper wallet preview is a CSS-scaled card. Its rendered box must
 * line up with the full-width controls below it across the 360–430px
 * mobile viewport range.
 */
import { completeProfileStep, expect, test } from "./fixtures";

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

test.describe("paper wallet card", () => {
  test("card and download button share the same horizontal bounds", async ({ page }) => {
    await completeProfileStep(page);
    await expectCardAlignsWithButton(page);
  });

  test("stays aligned across the mobile width range", async ({ page }) => {
    await completeProfileStep(page);
    for (const width of [360, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 896 });
      await expectCardAlignsWithButton(page);
    }
  });
});
