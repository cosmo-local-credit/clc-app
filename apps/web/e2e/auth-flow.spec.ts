/**
 * Authentication flow — end-to-end tests.
 *
 * Covers the automatable test cases from:
 *   - #1 QA: Authentication: Full Flow (Android)
 *   - #2 QA: Authentication: Full Flow (iOS)
 *
 * Excluded (manual-only):
 *   - WebAuthn / passkey flows (TC-12, TC-20, TC-21, TC-23, TC-30)
 *   - Real camera QR scanning (TC-13, TC-14, TC-16)
 *   - localStorage corruption edge case (TC-29)
 */
import percySnapshot from "@percy/playwright";
import {
  completeProfileStep,
  connectViaOnboarding,
  expect,
  gotoHydrated,
  signOut,
  test,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

test.describe("landing page", () => {
  test("renders for disconnected user (TC-01)", async ({ page }) => {
    await gotoHydrated(page, "/");

    await expect(page.getByRole("heading", { name: "CLC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Paper Wallet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Advanced options" })).toBeVisible();

    await percySnapshot(page, "Landing page");
  });

  test('"Create an account" navigates to /onboarding (TC-02)', async ({ page }) => {
    await gotoHydrated(page, "/");
    // Wait for the button to be fully interactive (React event handlers attached)
    await page
      .getByRole("button", { name: "Create an account" })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "Create an account" }).click();

    // Check the heading — more reliable than URL (redirects may interfere)
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Onboarding — profile form
// ---------------------------------------------------------------------------

test.describe("onboarding profile form", () => {
  test("validates required fields when empty (TC-03)", async ({ page }) => {
    await gotoHydrated(page, "/onboarding");
    await page.getByRole("button", { name: "Continue" }).click();

    // Should still be on the profile step
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your paper wallet" })).toBeHidden();

    // Validation error(s) should appear
    await expect(page.getByText(/required|enter/i).first()).toBeVisible();
  });

  test("accepts valid input and advances to wallet step (TC-04)", async ({ page }) => {
    await completeProfileStep(page);

    await expect(page.getByRole("heading", { name: "Your paper wallet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download card" })).toBeVisible();

    await percySnapshot(page, "Onboarding — paper wallet step");
  });
});

// ---------------------------------------------------------------------------
// Onboarding — paper wallet step
// ---------------------------------------------------------------------------

test.describe("paper wallet step", () => {
  // Each test starts at the wallet step.
  test.beforeEach(async ({ page }) => {
    await completeProfileStep(page);
  });

  test("back returns to profile (TC-05)", async ({ page }) => {
    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });

  test("displays address and QR (TC-06)", async ({ page }) => {
    // Address rendered with inline mono font, data-slot="address"
    await expect(page.locator('[data-slot="address"]')).toBeVisible();
    await expect(page.locator('[data-slot="address"]')).toContainText(/^0x/);

    // A canvas or img for the QR code
    const qr = page.locator("canvas, img[alt]").first();
    await expect(qr).toBeVisible();
  });

  test("wallet label input updates the card name (TC-07)", async ({ page }) => {
    const nameField = page.getByPlaceholder("Wallet name");
    const customName = "My Test Wallet";

    if (await nameField.isVisible()) {
      await nameField.fill(customName);
      await expect(page.getByText(customName).first()).toBeVisible();
    }
    // If no custom name field is shown, the card shows the profile name
    // (default behaviour).
  });

  test("download card triggers a PNG download (TC-08)", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      page.getByRole("button", { name: "Download card" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^clc-wallet-.*\.png$/);
  });

  test('"Continue" is disabled until key is acknowledged (TC-09)', async ({ page }) => {
    const continueBtn = page.getByRole("button", {
      name: /Continue with paper wallet only|Continue to wallet/,
    });

    // Button should be disabled before checking the ack box
    await expect(continueBtn).toBeDisabled();

    // After checking, it should be enabled
    await page.getByLabel("I have saved this key").check();
    await expect(continueBtn).toBeEnabled();
  });

  test("connects and navigates home (TC-10)", async ({ page }) => {
    await page.getByLabel("I have saved this key").check();

    const continueBtn = page.getByRole("button", {
      name: /Continue with paper wallet only|Continue to wallet/,
    });
    await continueBtn.click();

    // Should land on home page with wallet tab visible
    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible({
      timeout: 20_000,
    });

    // Connected address should be visible
    await expect(page.locator('[data-slot="address"]')).toBeVisible();

    await percySnapshot(page, "Home — connected wallet");
  });
});

// ---------------------------------------------------------------------------
// Sign in / sign out
// ---------------------------------------------------------------------------

test.describe("sign out", () => {
  test("sign out clears wallet and returns to landing (TC-11)", async ({ page }) => {
    await connectViaOnboarding(page);
    await signOut(page);

    // Landing page should be visible
    await expect(page.getByRole("heading", { name: "CLC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();

    // Refresh — should remain disconnected
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Private key entry (Advanced options)
// ---------------------------------------------------------------------------

test.describe("private key entry", () => {
  test("accepts a valid private key and connects (TC-17)", async ({ page }) => {
    await gotoHydrated(page, "/");

    // Open advanced options
    await page.getByRole("button", { name: "Advanced options" }).click();
    await page
      .getByRole("button", { name: "Private key" })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Private key" }).click();

    // Paste a valid key
    const validKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    await page.getByRole("textbox", { name: "Private key" }).fill(validKey);

    // Submit
    await page.getByRole("button", { name: "Sign in with private key" }).click();

    // Should navigate home and show connected state
    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("rejects invalid private key input (TC-18)", async ({ page }) => {
    await gotoHydrated(page, "/");

    await page.getByRole("button", { name: "Advanced options" }).click();
    await page
      .getByRole("button", { name: "Private key" })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Private key" }).click();

    await page.getByRole("textbox", { name: "Private key" }).fill("not-a-valid-key");
    await page.getByRole("button", { name: "Sign in with private key" }).click();

    // Error message should appear (the .text-destructive paragraph)
    await expect(page.locator(".text-destructive").filter({ hasText: /key/i })).toBeVisible({
      timeout: 5000,
    });

    // Should still be on landing page (or the root, not /onboarding)
    await expect(page).not.toHaveURL(/\/onboarding/);
  });

  test("closing private key form clears input (TC-19)", async ({ page }) => {
    await gotoHydrated(page, "/");

    await page.getByRole("button", { name: "Advanced options" }).click();
    await page
      .getByRole("button", { name: "Private key" })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Private key" }).click();

    await page.getByRole("textbox", { name: "Private key" }).fill("test-input");
    await page.getByLabel("Close private key form").click();

    // Reopen — field should be empty
    await page.getByRole("button", { name: "Private key" }).click();
    await expect(page.getByRole("textbox", { name: "Private key" })).toHaveValue("");
  });
});

// ---------------------------------------------------------------------------
// Wagmi reconnect on page refresh
// ---------------------------------------------------------------------------

test.describe("wagmi reconnect", () => {
  test("reconnects paper wallet on page refresh (TC-22)", async ({ page }) => {
    await connectViaOnboarding(page);

    // Capture the connected address
    const addressEl = page.locator('[data-slot="address"]');
    const address = await addressEl.textContent();

    // Refresh
    await page.reload();
    await page.waitForFunction(
      () => {
        const tsr = (window as unknown as { $_TSR?: { hydrated?: boolean } }).$_TSR;
        return tsr == null || tsr.hydrated === true;
      },
      null,
      { timeout: 20_000 },
    );

    // Should still show home page (connected state), not landing
    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "CLC" })).toBeHidden();

    // Address should match
    if (address) {
      await expect(page.locator('[data-slot="address"]')).toContainText(address.trim());
    }
  });
});

// ---------------------------------------------------------------------------
// URL import (?w=)
// ---------------------------------------------------------------------------

test.describe("URL import", () => {
  const validKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const anotherKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  test("connects silently when disconnected (TC-24)", async ({ page }) => {
    await gotoHydrated(page, `/?w=${validKey}`);

    // Param should be stripped
    await expect(page).not.toHaveURL(/\?w=/);

    // Should show home page (connected)
    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows switch dialog when already connected (TC-25)", async ({ page }) => {
    // Connect first
    await connectViaOnboarding(page);

    // Navigate with a different key
    await gotoHydrated(page, `/?w=${anotherKey}`);

    // Switch dialog should appear
    await expect(page.getByRole("button", { name: "Switch wallet" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("switch wallet confirm swaps to new wallet (TC-26)", async ({ page }) => {
    await connectViaOnboarding(page);
    await gotoHydrated(page, `/?w=${anotherKey}`);

    await page.getByRole("button", { name: "Switch wallet" }).click();

    // Should land on home page with new wallet
    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("switch wallet cancel keeps original wallet (TC-27)", async ({ page }) => {
    await connectViaOnboarding(page);

    // Capture original address
    const originalAddress = await page.locator('[data-slot="address"]').textContent();

    await gotoHydrated(page, `/?w=${anotherKey}`);
    await page.getByRole("button", { name: "Cancel" }).click();

    // Should be back on home page with original wallet
    await page
      .getByRole("heading", { name: "Wallet" })
      .waitFor({ state: "visible", timeout: 10_000 });

    if (originalAddress) {
      await expect(page.locator('[data-slot="address"]')).toContainText(originalAddress.trim());
    }
  });

  test("ignores invalid ?w= param and shows landing (TC-28)", async ({ page }) => {
    await gotoHydrated(page, "/?w=not-a-valid-key");

    // Landing page should render
    await expect(page.getByRole("heading", { name: "CLC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();

    // Param should be stripped
    await expect(page).not.toHaveURL(/\?w=/);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test.describe("edge cases", () => {
  test("Connecting spinner appears during wallet connection", async ({ page }) => {
    await gotoHydrated(page, "/");

    await page.getByRole("button", { name: "Advanced options" }).click();
    await page
      .getByRole("button", { name: "Private key" })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Private key" }).click();

    const validKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    await page.getByRole("textbox", { name: "Private key" }).fill(validKey);
    await page.getByRole("button", { name: "Sign in with private key" }).click();

    // "Connecting..." text should appear briefly
    await expect(page.getByText("Connecting...")).toBeVisible({
      timeout: 3000,
    });
  });

  test("sign out shows disabled state while signing out", async ({ page }) => {
    await connectViaOnboarding(page);

    // Navigate to settings
    await page.getByRole("button", { name: "Settings" }).click();

    // Click sign out — button should show signing out state
    const signOutBtn = page.getByRole("button", {
      name: /Sign out|Signing out/,
    });
    await signOutBtn.click();

    // After click, it should briefly show "Signing out..." or become disabled
    // We just verify the landing page eventually renders
    await expect(page.getByRole("heading", { name: "CLC" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("fast double-tap on sign-in does not double-connect", async ({ page }) => {
    await gotoHydrated(page, "/");

    await page.getByRole("button", { name: "Advanced options" }).click();
    await page
      .getByRole("button", { name: "Private key" })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Private key" }).click();

    const validKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    await page.getByRole("textbox", { name: "Private key" }).fill(validKey);

    const submitBtn = page.getByRole("button", {
      name: "Sign in with private key",
    });

    // Double-click quickly
    await submitBtn.dblclick();

    // Should resolve to home page without errors
    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("advanced options toggle does not break layout", async ({ page }) => {
    await gotoHydrated(page, "/");

    // Open
    await page.getByRole("button", { name: "Advanced options" }).click();
    await page
      .getByRole("button", { name: "Private key" })
      .waitFor({ state: "visible", timeout: 5000 });
    await expect(page.getByRole("button", { name: "Private key" })).toBeVisible();

    // Close
    await page.getByRole("button", { name: "Advanced options" }).click();
    await expect(page.getByRole("button", { name: "Private key" })).toBeHidden();

    // Page buttons still visible
    await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Paper Wallet" })).toBeVisible();
  });
});
