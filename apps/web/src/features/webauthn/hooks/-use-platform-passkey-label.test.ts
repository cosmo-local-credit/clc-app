import { describe, expect, it } from "vitest";
import {
	isPasskeyPlatformAvailable,
	pickPasskeyProvider,
} from "./use-platform-passkey-label";

// ── UA string fixtures ─────────────────────────────────────────────────────────

const UA = {
	chromeAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
	safariIos:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
	safariIpad:
		"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
	desktopSafari:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
	desktopChrome:
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	chromeIos:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1",
	firefoxAndroid:
		"Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0",
	samsungBrowser:
		"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
};

function withUA(ua: string, fn: () => void) {
	const original = navigator.userAgent;
	Object.defineProperty(navigator, "userAgent", {
		configurable: true,
		value: ua,
	});
	try {
		fn();
	} finally {
		Object.defineProperty(navigator, "userAgent", {
			configurable: true,
			value: original,
		});
	}
}

// ── isPasskeyPlatformAvailable ─────────────────────────────────────────────────

describe("isPasskeyPlatformAvailable", () => {
	it("returns true for Chrome Android", () => {
		withUA(UA.chromeAndroid, () => {
			expect(isPasskeyPlatformAvailable()).toBe(true);
		});
	});

	it("returns true for Safari on iPhone", () => {
		withUA(UA.safariIos, () => {
			expect(isPasskeyPlatformAvailable()).toBe(true);
		});
	});

	it("returns true for Safari on iPad", () => {
		withUA(UA.safariIpad, () => {
			expect(isPasskeyPlatformAvailable()).toBe(true);
		});
	});

	it("returns false for desktop Safari", () => {
		withUA(UA.desktopSafari, () => {
			expect(isPasskeyPlatformAvailable()).toBe(false);
		});
	});

	it("returns false for desktop Chrome", () => {
		withUA(UA.desktopChrome, () => {
			expect(isPasskeyPlatformAvailable()).toBe(false);
		});
	});

	it("returns false for Chrome on iOS (CriOS)", () => {
		withUA(UA.chromeIos, () => {
			expect(isPasskeyPlatformAvailable()).toBe(false);
		});
	});

	it("returns false for Firefox on Android", () => {
		withUA(UA.firefoxAndroid, () => {
			expect(isPasskeyPlatformAvailable()).toBe(false);
		});
	});

	it("returns false for Samsung Browser", () => {
		withUA(UA.samsungBrowser, () => {
			expect(isPasskeyPlatformAvailable()).toBe(false);
		});
	});
});

// ── pickPasskeyProvider ────────────────────────────────────────────────────────

describe("pickPasskeyProvider", () => {
	it("returns apple for iPhone Safari", () => {
		withUA(UA.safariIos, () => {
			expect(pickPasskeyProvider()).toBe("apple");
		});
	});

	it("returns google for Chrome Android", () => {
		withUA(UA.chromeAndroid, () => {
			expect(pickPasskeyProvider()).toBe("google");
		});
	});

	it("returns apple for iPad Safari", () => {
		withUA(UA.safariIpad, () => {
			expect(pickPasskeyProvider()).toBe("apple");
		});
	});
});
