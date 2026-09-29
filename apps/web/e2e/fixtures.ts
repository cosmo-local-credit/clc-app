import { test as base, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const PROFILE_PHOTO = fileURLToPath(new URL("../public/brand/prod/icon-192.png", import.meta.url));

/**
 * Navigate and wait for the client to hydrate.
 *
 * TanStack Start streams the SSR response, so the document never reaches
 * `load`/`domcontentloaded` — navigate with `commit` instead. Then block
 * until hydration finishes: TanStack flips `window.$_TSR.hydrated` (and
 * later deletes `$_TSR`) on hydrate.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  // TanStack Start streams the SSR response so the document may never
  // fire `load`/`domcontentloaded`. Navigate with `commit` (document
  // parsed), wait for TanStack Router hydration flag, then give React
  // enough time to mount and attach event handlers to the delegation
  // root. Buttons are visible in the DOM before React mounts; clicks
  // before that point are silently ignored.
  await page.goto(path, { waitUntil: "commit" });
  await page.waitForFunction(
    () => {
      const tsr = (window as unknown as { $_TSR?: { hydrated?: boolean } }).$_TSR;
      return tsr == null || tsr.hydrated === true;
    },
    null,
    { timeout: 20_000 },
  );
  // Empirically, React needs ~2s after the TSR hydration flag flips.
  await page.waitForTimeout(2500);
}

/**
 * Fills the onboarding profile form and advances to the paper wallet step.
 *
 * The location field is geocoder-backed (ArcGIS World Geocoder), so the
 * helper types a query, waits for the suggestion listbox, picks the first
 * result, then waits for the reverse-geocode to resolve before submitting.
 */
export async function completeProfileStep(page: Page): Promise<void> {
  await gotoHydrated(page, "/onboarding?step=profile");

  await page.getByLabel("Choose a profile photo").setInputFiles(PROFILE_PHOTO);
  await page.getByRole("button", { name: "Use photo" }).click();
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

  const walletHeading = page.getByRole("heading", { name: "Your paper wallet" });
  const paperOnly = page.getByRole("radio", { name: "Paper wallet only" });
  const nextStep = await Promise.race([
    walletHeading.waitFor({ state: "visible", timeout: 15_000 }).then(() => "wallet" as const),
    paperOnly.waitFor({ state: "visible", timeout: 15_000 }).then(() => "method" as const),
  ]);
  if (nextStep === "method") {
    await paperOnly.check();
    await page.getByRole("button", { name: "Continue" }).click();
    await walletHeading.waitFor({ state: "visible", timeout: 15_000 });
  }
}

/** Disable optional QR encryption and download the card so wallet continuation can unlock. */
export async function downloadPaperWallet(page: Page): Promise<void> {
  const protection = page.getByLabel("Protect paper wallet with a password");
  if (await protection.isChecked()) await protection.uncheck();

  await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    page.getByRole("button", { name: "Download card" }).click(),
  ]);
}

/**
 * Connect with a paper wallet through the onboarding flow, returning to
 * the home page as a connected user. Useful as a setup step for tests
 * that need an authenticated session.
 */
export async function connectViaOnboarding(page: Page): Promise<void> {
  await completeProfileStep(page);
  await downloadPaperWallet(page);

  // Acknowledge key saved and explicitly accept the platform terms.
  await page.getByLabel("I have saved this key").check();
  await page.getByRole("checkbox", { name: "Accept Terms and Conditions" }).check();

  // Click the paper-wallet-only continue button
  const continueButton = page.getByRole("button", {
    name: /Continue with paper wallet only|Continue to wallet/,
  });
  await continueButton.click();

  // Wait for authenticated home shell to appear. The default tab is now Market,
  // so use the private Wallet nav item as the authenticated-state signal.
  await page.getByRole("button", { name: "Wallet" }).waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * Sign out from the home page and return to the public market.
 */
export async function signOut(page: Page): Promise<void> {
  // Navigate to settings tab
  await page.getByRole("button", { name: "Settings" }).click();

  // Click sign out
  await page.getByRole("button", { name: "Sign out" }).click();

  // Wait for guest market banner and hidden private nav.
  await page.getByText("Join CLC").waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: "Wallet" }).waitFor({ state: "hidden", timeout: 10_000 });
}

export { expect } from "@playwright/test";
export const test = base;
