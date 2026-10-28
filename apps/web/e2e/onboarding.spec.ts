/**
 * Onboarding — profile form validation and navigation.
 */
import percySnapshot from "@percy/playwright";
import { completeProfileStep, expect, gotoHydrated, test } from "./fixtures";

test.describe("onboarding profile", () => {
  test("does not advance when the form is empty", async ({ page }) => {
    await gotoHydrated(page, "/onboarding?step=profile");
    const continueButton = page.getByRole("button", { name: "Continue" });
    await continueButton.scrollIntoViewIfNeeded();
    await continueButton.click();

    // Still on the profile step — validation blocked the submit.
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your sign-in card" })).toBeHidden();
    const photoButton = page.getByRole("button", { name: "Add a photo" });
    await expect(photoButton).toBeFocused();
    await expect(photoButton).toBeInViewport();
    await expect(photoButton).toHaveAttribute("aria-invalid", "true");

    await percySnapshot(page, "Onboarding — profile form validation");
  });

  test("completes the profile and reaches the paper wallet step", async ({ page }) => {
    await completeProfileStep(page);

    await expect(page.getByRole("heading", { name: "Your sign-in card" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download card" })).toBeVisible();
  });

  test("shows phone input field with country selector", async ({ page }) => {
    await gotoHydrated(page, "/onboarding?step=profile");

    // The phone input should be present
    const phoneInput = page.getByLabel("Phone number");
    await expect(phoneInput).toBeVisible();

    // Should accept phone number input
    await phoneInput.fill("+254712345678");
    // Phone lib normalizes away the leading +; assert the numeric value
    await expect(phoneInput).toHaveValue(/2547/);
  });
});
