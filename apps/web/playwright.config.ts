import { defineConfig, devices } from "@playwright/test";

/**
 * Two run modes share this config:
 *
 *   1. Local        — `pnpm test:e2e`        → headless Desktop Chrome.
 *   2. BrowserStack — `pnpm test:e2e:bs`     → real devices (see
 *                                               browserstack.yml). The
 *                                               browserstack-node-sdk patches
 *                                               the browser launch and fans the
 *                                               same specs across every device.
 *
 * Target: e2e runs against a real (production) build, NOT the Vite dev server —
 * the dev server's streaming HMR doesn't complete hydration headlessly. Default
 * is the live deployment; override with BASE_URL (e.g. a Cloudflare PR preview).
 * To run a local production build, serve it and pass BASE_URL=http://localhost:<port>;
 * the config will boot `vite preview` for you.
 */
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL =
	process.env.BASE_URL ??
	(process.env.E2E_PORT
		? `http://localhost:${port}`
		: "https://app.cosmolocal.credit");
const isLocalServer = baseURL.startsWith("http://localhost");

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
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
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	// Only manage a server when pointing at localhost; deployed targets are live.
	// Only manage a server when targeting localhost. Uses `vite preview` (a
	// production build) — not `vite dev` — so hydration completes headlessly.
	webServer: isLocalServer
		? {
				command: `pnpm exec vite preview --port ${port} --strictPort`,
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
			}
		: undefined,
});
