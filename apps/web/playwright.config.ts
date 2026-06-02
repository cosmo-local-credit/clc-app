import { defineConfig, devices } from "@playwright/test";

/**
 * Two run modes share this config:
 *
 *   1. Local        — `pnpm test:e2e`        → emulated mobile devices
 *      (Chromium with Pixel 7 and iPhone 14 viewport / user-agent).
 *   2. BrowserStack — `pnpm test:e2e:bs`     → real devices from
 *      browserstack.yml. The browserstack-node-sdk patches chromium
 *      launch and fans specs across every platform listed there.
 *
 * Target: e2e runs against a real (production) build, NOT the Vite dev
 * server — the dev server's streaming HMR doesn't complete hydration
 * headlessly. Default is the live deployment; override with BASE_URL
 * (e.g. a Cloudflare PR preview). To run a local production build via
 * wrangler, serve it and pass BASE_URL=http://localhost:<port>; the
 * config will NOT manage the server (wrangler is started separately).
 */
const onBrowserStack = process.env.BROWSERSTACK === "1";

const baseURL = process.env.BASE_URL ?? "https://app.cosmolocal.credit";

export default defineConfig({
	testDir: "./e2e",
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI
		? [["list"], ["html", { open: "never" }]]
		: [["list"]],
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},

	projects: onBrowserStack
		? [
				// BrowserStack: the SDK reads browserstack.yml and intercepts
				// chromium.launch(), routing each spec to every real device.
				{ name: "chromium", use: { browserName: "chromium" } },
			]
		: [
				// Local: both use Chromium with mobile viewport / user-agent
				// from Playwright's device registry. WebKit is not installed;
				// iOS Safari is emulated via Chromium user-agent + viewport.
				{ name: "pixel-7", use: { ...devices["Pixel 7"] } },
				{
					name: "iphone-14",
					use: { ...devices["iPhone 14"], browserName: "chromium" },
				},
			],

	// No webServer — we target the live deployment by default. For local
	// wrangler dev, start it separately and pass BASE_URL=http://localhost:<port>.
	webServer: undefined,
});
