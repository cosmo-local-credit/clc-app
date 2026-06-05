import {
	IDBCursor,
	IDBCursorWithValue,
	IDBDatabase,
	IDBFactory,
	IDBIndex,
	IDBKeyRange,
	IDBObjectStore,
	IDBOpenDBRequest,
	IDBRequest,
	IDBTransaction,
	IDBVersionChangeEvent,
} from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPayload } from "../logic/payload-schema";
import {
	clearQueuedNotificationAcks,
	enqueueNotificationAck,
	getNotificationInboxMessage,
	getOrCreateNotificationDeviceId,
	isNotificationStorageAvailable,
	listNotificationInboxMessages,
	listQueuedNotificationAcks,
	listSubscriptionDiagnostics,
	markNotificationInboxMessageActioned,
	markNotificationInboxMessageRead,
	type NotificationInboxMessage,
	openNotificationDatabase,
	readNotificationConfig,
	recordSubscriptionDiagnostic,
	removeQueuedNotificationAck,
	resetNotificationDatabaseForTests,
	saveNotificationInboxMessage,
	updateNotificationAckAttempt,
	updateNotificationConfig,
} from "./notification-db";

const basePayload: NotificationPayload = {
	body: "Voucher received",
	createdAt: "2026-06-05T12:00:00.000Z",
	kind: "voucher.received",
	metadataStatus: "valid",
	notificationId: "notification-1",
	priority: "high",
	targetUrl: "/wallet",
	title: "Voucher received",
	walletAddressTarget: "0x1234567890abcdef1234567890abcdef12345678",
};

beforeEach(async () => {
	await resetNotificationDatabaseForTests();
	vi.stubGlobal("IDBCursor", IDBCursor);
	vi.stubGlobal("IDBCursorWithValue", IDBCursorWithValue);
	vi.stubGlobal("IDBDatabase", IDBDatabase);
	vi.stubGlobal("IDBFactory", IDBFactory);
	vi.stubGlobal("IDBIndex", IDBIndex);
	vi.stubGlobal("IDBKeyRange", IDBKeyRange);
	vi.stubGlobal("IDBObjectStore", IDBObjectStore);
	vi.stubGlobal("IDBOpenDBRequest", IDBOpenDBRequest);
	vi.stubGlobal("IDBRequest", IDBRequest);
	vi.stubGlobal("IDBTransaction", IDBTransaction);
	vi.stubGlobal("IDBVersionChangeEvent", IDBVersionChangeEvent);
	vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(async () => {
	await resetNotificationDatabaseForTests();
	vi.unstubAllGlobals();
});

describe("notification device storage", () => {
	it("creates a stable device id once and reuses it", async () => {
		const firstDeviceId = await getOrCreateNotificationDeviceId();
		const secondDeviceId = await getOrCreateNotificationDeviceId();

		expect(firstDeviceId).toMatch(/^device-/);
		expect(secondDeviceId).toBe(firstDeviceId);
	});
});

describe("notification config storage", () => {
	it("persists config values and preserves existing fields on update", async () => {
		await updateNotificationConfig({
			appVersion: "web-test",
			permissionState: "granted",
			serviceWorkerVersion: "/sw.js",
			syncCursor: "cursor-1",
			vapidKeyVersion: "vapid-v1",
		});

		await updateNotificationConfig({
			syncCursor: "cursor-2",
			subscriptionHash: "subscription-hash",
		});

		expect(await readNotificationConfig()).toMatchObject({
			appVersion: "web-test",
			key: "current",
			permissionState: "granted",
			serviceWorkerVersion: "/sw.js",
			subscriptionHash: "subscription-hash",
			syncCursor: "cursor-2",
			vapidKeyVersion: "vapid-v1",
		});
	});
});

describe("notification inbox storage", () => {
	it("stores, updates, lists, reads, and marks inbox messages", async () => {
		const olderMessage = inboxMessage({
			notificationId: "notification-older",
			receivedAt: "2026-06-05T12:00:00.000Z",
			title: "Older notification",
		});
		const newerMessage = inboxMessage({
			notificationId: "notification-newer",
			receivedAt: "2026-06-05T12:05:00.000Z",
			title: "Newer notification",
		});

		await saveNotificationInboxMessage(olderMessage);
		await saveNotificationInboxMessage(newerMessage);
		await saveNotificationInboxMessage({
			...olderMessage,
			body: "Updated body",
			receivedAt: "2026-06-05T12:03:00.000Z",
		});

		expect(
			await getNotificationInboxMessage("notification-older"),
		).toMatchObject({
			body: "Updated body",
			notificationId: "notification-older",
			receivedAt: "2026-06-05T12:03:00.000Z",
		});

		expect(
			(await listNotificationInboxMessages()).map(
				(message) => message.notificationId,
			),
		).toEqual(["notification-newer", "notification-older"]);

		expect(
			await markNotificationInboxMessageRead(
				"notification-older",
				"2026-06-05T12:06:00.000Z",
			),
		).toMatchObject({
			notificationId: "notification-older",
			readAt: "2026-06-05T12:06:00.000Z",
		});

		expect(
			await markNotificationInboxMessageActioned(
				"notification-older",
				"2026-06-05T12:07:00.000Z",
			),
		).toMatchObject({
			actionedAt: "2026-06-05T12:07:00.000Z",
			notificationId: "notification-older",
			readAt: "2026-06-05T12:06:00.000Z",
		});

		expect(await markNotificationInboxMessageRead("missing")).toBeNull();
		expect(await markNotificationInboxMessageActioned("missing")).toBeNull();
	});
});

describe("notification ack queue storage", () => {
	it("enqueues, updates, removes, and clears pending acks", async () => {
		const deliveryAck = await enqueueNotificationAck({
			deviceId: "device-1",
			kind: "delivery",
			notificationId: "notification-1",
			walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
		});
		await waitForClockTick();
		const clickAck = await enqueueNotificationAck({
			actionId: "view",
			deviceId: "device-1",
			kind: "click",
			notificationId: "notification-2",
			targetUrl: "/wallet",
		});

		expect(deliveryAck).toMatchObject({
			attemptCount: 0,
			deviceId: "device-1",
			kind: "delivery",
			notificationId: "notification-1",
		});
		expect(clickAck.ackId).toMatch(/^ack-click-/);
		expect(
			(await listQueuedNotificationAcks()).map((ack) => ack.ackId),
		).toEqual([deliveryAck.ackId, clickAck.ackId]);

		expect(
			await updateNotificationAckAttempt(deliveryAck.ackId, "network error"),
		).toMatchObject({
			ackId: deliveryAck.ackId,
			attemptCount: 1,
			error: "network error",
		});
		expect(await updateNotificationAckAttempt("missing")).toBeNull();

		await removeQueuedNotificationAck(deliveryAck.ackId);
		expect(
			(await listQueuedNotificationAcks()).map((ack) => ack.ackId),
		).toEqual([clickAck.ackId]);

		await clearQueuedNotificationAcks();
		expect(await listQueuedNotificationAcks()).toEqual([]);
	});
});

describe("notification subscription diagnostics storage", () => {
	it("records diagnostics newest first", async () => {
		const activeDiagnostic = await recordSubscriptionDiagnostic({
			endpoint: "https://push.example/subscription-1",
			status: "active",
			vapidKeyVersion: "vapid-v1",
		});
		await waitForClockTick();
		const failedDiagnostic = await recordSubscriptionDiagnostic({
			code: 410,
			error: "gone",
			status: "failed",
		});

		expect(activeDiagnostic.diagnosticId).toMatch(/^subscription-active-/);
		expect(
			(await listSubscriptionDiagnostics()).map(
				(diagnostic) => diagnostic.diagnosticId,
			),
		).toEqual([failedDiagnostic.diagnosticId, activeDiagnostic.diagnosticId]);
	});
});

describe("notification storage availability", () => {
	it("reports unavailable storage and throws clearly", async () => {
		await resetNotificationDatabaseForTests();
		vi.stubGlobal("indexedDB", undefined);

		expect(isNotificationStorageAvailable()).toBe(false);
		await expect(openNotificationDatabase()).rejects.toThrow(
			"IndexedDB is not available in this environment.",
		);
	});
});

function inboxMessage(
	overrides: Partial<NotificationInboxMessage> = {},
): NotificationInboxMessage {
	return {
		...basePayload,
		receivedAt: "2026-06-05T12:00:00.000Z",
		...overrides,
	};
}

function waitForClockTick(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 1);
	});
}
