import { defineConfig, devices } from "@playwright/test";

/**
 * Tests run against a real (production) build, NOT the Vite dev server.
 * Default target is the live deployment; override with BASE_URL (e.g. a
 * Cloudflare PR preview). To run against a local wrangler build, serve it
 * separately and pass BASE_URL=http://localhost:<port>.
 */
const baseURL = process.env.BASE_URL ?? "https://app.cosmolocal.credit";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "pixel-7", use: { ...devices["Pixel 7"], channel: "chrome" } },
    {
      name: "iphone-14",
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
  webServer: undefined,
});
