import { describe, expect, it } from "vitest";
import {
	getNotificationKindPolicy,
	type NotificationKind,
	notificationKindSchema,
	notificationPrioritySchema,
	parseNotificationPayload,
} from "./payload-schema";

const APP_ORIGIN = "https://app.cosmolocal.credit";

const basePayload = {
	body: "You received a voucher.",
	createdAt: "2026-06-04T12:00:00Z",
	kind: "voucher.received",
	notificationId: "notification-1",
	priority: "high",
	targetUrl: "/wallet",
	title: "Voucher received",
	walletAddressTarget: "0x1234567890abcdef1234567890abcdef12345678",
};

describe("notificationKindSchema", () => {
	it.each<NotificationKind>([
		"voucher.received",
		"swap.completed",
		"offramp.completed",
	])("accepts %s", (kind) => {
		expect(notificationKindSchema.safeParse(kind).success).toBe(true);
	});

	it("rejects unsupported notification kinds", () => {
		expect(notificationKindSchema.safeParse("voucher.expired").success).toBe(
			false,
		);
	});
});

describe("notificationPrioritySchema", () => {
	it.each(["very-low", "low", "normal", "high"])("accepts %s", (priority) => {
		expect(notificationPrioritySchema.safeParse(priority).success).toBe(true);
	});

	it("rejects unsupported priorities", () => {
		expect(notificationPrioritySchema.safeParse("urgent").success).toBe(false);
	});
});

describe("getNotificationKindPolicy", () => {
	it("uses high priority and renotify for voucher received", () => {
		expect(getNotificationKindPolicy("voucher.received")).toMatchObject({
			interactionMode: "click-only",
			priority: "high",
			renotify: true,
			settingsScope: "device",
			signOutPolicy: "retain-until-explicit-disable",
		});
	});

	it("uses normal priority without renotify for swap completed", () => {
		expect(getNotificationKindPolicy("swap.completed")).toMatchObject({
			interactionMode: "click-only",
			priority: "normal",
			renotify: false,
			settingsScope: "device",
			signOutPolicy: "retain-until-explicit-disable",
		});
	});

	it("uses high priority and renotify for offramp completed", () => {
		expect(getNotificationKindPolicy("offramp.completed")).toMatchObject({
			interactionMode: "click-only",
			priority: "high",
			renotify: true,
			settingsScope: "device",
			signOutPolicy: "retain-until-explicit-disable",
		});
	});
});

describe("parseNotificationPayload", () => {
	it("parses a valid voucher notification payload", () => {
		const rawPayload = {
			...basePayload,
			actions: [{ action: " view ", title: " View " }],
			expiresAt: "2026-06-05T12:00:00Z",
			offRampReference: " offramp-1 ",
			swapId: " swap-1 ",
			voucherId: " voucher-1 ",
		};
		const result = parseNotificationPayload(rawPayload, {
			appOrigin: APP_ORIGIN,
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.payload).toMatchObject({
			actions: [{ action: "view", title: "View" }],
			expiresAt: "2026-06-05T12:00:00Z",
			kind: "voucher.received",
			offRampReference: "offramp-1",
			swapId: "swap-1",
			targetUrl: "/wallet",
			voucherId: "voucher-1",
		});
		expect(result.rawPayload).toBe(rawPayload);
		expect(result.payload).not.toHaveProperty("metadataStatus");
	});

	it("parses an explicit very-low priority", () => {
		const result = parseNotificationPayload(
			{
				...basePayload,
				priority: "very-low",
			},
			{ appOrigin: APP_ORIGIN },
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.payload.priority).toBe("very-low");
	});

	it("parses all v1 notification kinds", () => {
		for (const kind of [
			"voucher.received",
			"swap.completed",
			"offramp.completed",
		] satisfies NotificationKind[]) {
			const result = parseNotificationPayload(
				{ ...basePayload, kind },
				{ appOrigin: APP_ORIGIN },
			);

			expect(result.success).toBe(true);
		}
	});

	it("defaults missing priority from the kind policy", () => {
		const result = parseNotificationPayload(
			{
				...basePayload,
				kind: "swap.completed",
				priority: undefined,
			},
			{ appOrigin: APP_ORIGIN },
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.payload.priority).toBe("normal");
	});

	it("normalizes same-origin absolute target URLs", () => {
		const result = parseNotificationPayload(
			{
				...basePayload,
				targetUrl: "https://app.cosmolocal.credit/wallet?tab=activity",
			},
			{ appOrigin: APP_ORIGIN },
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.payload.targetUrl).toBe("/wallet?tab=activity");
	});

	it("rejects unsafe target URLs", () => {
		const rawPayload = {
			...basePayload,
			targetUrl: "https://evil.example/wallet",
		};
		const result = parseNotificationPayload(rawPayload, {
			appOrigin: APP_ORIGIN,
		});

		expect(result.success).toBe(false);
		if (result.success) return;

		expect(result.rawPayload).toBe(rawPayload);
	});

	it("rejects invalid wallet addresses when present", () => {
		const result = parseNotificationPayload(
			{ ...basePayload, walletAddressTarget: "not-a-wallet" },
			{ appOrigin: APP_ORIGIN },
		);

		expect(result.success).toBe(false);
	});

	it("rejects invalid timestamps", () => {
		const result = parseNotificationPayload(
			{ ...basePayload, createdAt: "today" },
			{ appOrigin: APP_ORIGIN },
		);

		expect(result.success).toBe(false);
	});

	it("returns a basic notification when optional metadata is malformed", () => {
		const rawPayload = {
			...basePayload,
			actions: [{ action: "", title: "" }],
			expiresAt: "2026-06-05T12:00:00Z",
			offRampReference: "offramp-1",
			swapId: "swap-1",
			voucherId: 42,
		};
		const result = parseNotificationPayload(rawPayload, {
			appOrigin: APP_ORIGIN,
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.payload).toMatchObject({
			body: "You received a voucher.",
			kind: "voucher.received",
			notificationId: "notification-1",
			priority: "high",
			targetUrl: "/wallet",
			title: "Voucher received",
		});
		expect(result.payload.actions).toBeUndefined();
		expect(result.payload.expiresAt).toBeUndefined();
		expect(result.payload.offRampReference).toBeUndefined();
		expect(result.payload.swapId).toBeUndefined();
		expect(result.payload.voucherId).toBeUndefined();
		expect(result.payload).not.toHaveProperty("metadataStatus");
		expect(result.rawPayload).toBe(rawPayload);
	});
});
