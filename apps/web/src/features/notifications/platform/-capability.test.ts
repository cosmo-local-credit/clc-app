import { describe, expect, it } from "vitest";
import {
	detectNotificationCapability,
	type NotificationCapabilityEnvironment,
} from "./capability";

const UA = {
	chromeAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
	safariIos:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
	desktopChrome:
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	samsungBrowser:
		"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
};

const supportedBase: NotificationCapabilityEnvironment = {
	hasNotification: true,
	hasPushManager: true,
	hasServiceWorker: true,
	isSecureContext: true,
	isStandalone: false,
	maxTouchPoints: 1,
	notificationPermission: "default",
	userAgent: UA.chromeAndroid,
};

function capability(
	overrides: Partial<NotificationCapabilityEnvironment> = {},
) {
	return detectNotificationCapability({ ...supportedBase, ...overrides });
}

describe("detectNotificationCapability", () => {
	it("returns supported for Chrome Android when required APIs are present", () => {
		expect(capability()).toEqual({
			canRequestPermission: true,
			canSubscribe: false,
			hasNotification: true,
			hasPushManager: true,
			hasServiceWorker: true,
			isSecureContext: true,
			permission: "default",
			platform: "chrome-android",
			reasons: [],
			status: "supported",
		});
	});

	it("returns supported for iOS Safari Home Screen PWA", () => {
		expect(
			capability({
				isStandalone: true,
				userAgent: UA.safariIos,
			}),
		).toMatchObject({
			platform: "ios-safari-home-screen",
			reasons: [],
			status: "supported",
		});
	});

	it("returns install-required for iOS Safari browser tabs", () => {
		expect(
			capability({
				hasPushManager: false,
				isStandalone: false,
				userAgent: UA.safariIos,
			}),
		).toMatchObject({
			canRequestPermission: false,
			canSubscribe: false,
			platform: "ios-safari-tab",
			reasons: ["ios-safari-tab"],
			status: "install-required",
		});
	});

	it("returns unsupported for non-target platforms", () => {
		expect(capability({ userAgent: UA.desktopChrome })).toMatchObject({
			platform: "unsupported",
			reasons: ["unsupported-platform"],
			status: "unsupported",
		});
	});

	it("does not treat Samsung Browser as supported Chrome Android", () => {
		expect(capability({ userAgent: UA.samsungBrowser })).toMatchObject({
			platform: "unsupported",
			reasons: ["unsupported-platform"],
			status: "unsupported",
		});
	});

	it("reports insecure contexts before platform support", () => {
		expect(capability({ isSecureContext: false })).toMatchObject({
			platform: "chrome-android",
			reasons: ["insecure-context"],
			status: "unsupported",
		});
	});

	it("reports missing Notification API", () => {
		expect(
			capability({
				hasNotification: false,
				notificationPermission: undefined,
			}),
		).toMatchObject({
			permission: "unavailable",
			reasons: ["missing-notification-api"],
			status: "unsupported",
		});
	});

	it("reports missing service worker support", () => {
		expect(capability({ hasServiceWorker: false })).toMatchObject({
			reasons: ["missing-service-worker"],
			status: "unsupported",
		});
	});

	it("reports missing PushManager support", () => {
		expect(capability({ hasPushManager: false })).toMatchObject({
			reasons: ["missing-push-manager"],
			status: "unsupported",
		});
	});

	it("keeps denied permission separate from platform support", () => {
		expect(capability({ notificationPermission: "denied" })).toMatchObject({
			canRequestPermission: false,
			canSubscribe: false,
			permission: "denied",
			status: "supported",
		});
	});

	it("marks granted supported capability as subscribable", () => {
		expect(capability({ notificationPermission: "granted" })).toMatchObject({
			canRequestPermission: false,
			canSubscribe: true,
			permission: "granted",
			status: "supported",
		});
	});
});
