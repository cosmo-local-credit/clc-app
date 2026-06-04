import { z } from "zod";
import {
	getNotificationKindPolicy,
	type NotificationAction,
	type NotificationKind,
	type NotificationPriority,
	notificationKindSchema,
	notificationPrioritySchema,
} from "../logic/payload-schema";
import type { NotificationPermissionSnapshot } from "../platform/capability";

const DEFAULT_WEBPUSH_BASE_URL = "http://localhost:8787";

export type NotificationClientOptions = {
	baseUrl?: string;
	fetcher?: typeof fetch;
	signal?: AbortSignal;
};

export type NotificationPushSubscriptionJSON = {
	endpoint: string;
	expirationTime?: number | null;
	keys: {
		auth: string;
		p256dh: string;
	};
};

export type VapidPublicKeyResponse = {
	keyVersion: string;
	publicKey: string;
};

export type RegisterNotificationDeviceRequest = {
	appVersion?: string;
	currentWalletAddress?: string;
	deviceId: string;
	linkedWalletAddresses?: string[];
	permissionState?: NotificationPermissionSnapshot;
	platform?: string;
	pushSubscription?: NotificationPushSubscriptionJSON;
	serviceWorkerVersion?: string;
	vapidKeyVersion?: string;
};

export type RegisterNotificationDeviceResponse = {
	canonicalLinkedWalletAddresses: string[];
	deviceId: string;
	inboxSyncCursor: string;
	notificationSettings: {
		enabled: boolean;
	};
	status: string;
	subscriptionStatus: string;
};

export type LinkNotificationWalletRequest = {
	deviceId: string;
	walletAddress: string;
};

export type LinkNotificationWalletResponse = {
	linkedWalletAddresses: string[];
};

export type DisableNotificationDeviceRequest = {
	deviceId: string;
	subscriptionEndpoint?: string;
};

export type DisableNotificationDeviceResponse = {
	deviceId: string;
	subscriptionStatus: string;
};

export type SendNotificationDeliveryAckRequest = {
	deviceId: string;
	notificationId: string;
	platform?: string;
	receivedAt?: string;
	serviceWorkerVersion?: string;
	shownAt?: string;
	walletAddressTarget?: string;
};

export type SendNotificationClickAckRequest = {
	actionId?: string;
	deviceId: string;
	notificationId: string;
	targetUrl?: string;
	timestamp?: string;
};

export type NotificationAckResponse = {
	accepted: boolean;
};

export type SyncNotificationInboxRequest = {
	deviceId: string;
	lastSyncCursor?: string;
	linkedWalletAddresses?: string[];
};

export type BackendNotificationPayload = {
	actions?: NotificationAction[];
	body: string;
	createdAt: string;
	expiresAt?: string;
	kind: NotificationKind;
	notificationId: string;
	offRampReference?: string;
	priority: NotificationPriority;
	swapId?: string;
	targetUrl: string;
	title: string;
	voucherId?: string;
	walletAddressTarget?: string;
};

export type BackendInboxMessage = BackendNotificationPayload & {
	actionId?: string;
	clickedAt?: string;
	deviceId: string;
	pushError?: string;
	pushStatus: string;
	pushStatusCode?: number;
	receivedAt?: string;
	recordId: string;
	revision: number;
	sentAt: string;
	shownAt?: string;
};

export type SyncNotificationInboxResponse = {
	deletedIds: string[];
	messages: BackendInboxMessage[];
	nextSyncCursor: string;
};

export type DevSendNotificationRequest = {
	deviceId?: string;
	notification: Partial<BackendNotificationPayload> &
		Pick<BackendNotificationPayload, "kind">;
	walletAddress?: string;
};

export type DevSendNotificationResponse = {
	notificationId: string;
	recipients: Array<{
		deviceId: string;
		error?: string;
		status: string;
		statusCode?: number;
	}>;
};

export type DevDebugStateResponse = {
	allowOrigins: string[];
	keyVersion: string;
	state: {
		clickAcks: unknown[];
		deliveryAcks: unknown[];
		devices: Record<string, unknown>;
		messages: BackendInboxMessage[];
		revision: number;
	};
	vapidPublicKey: string;
};

export class NotificationClientError extends Error {
	body: unknown;
	status: number;

	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = "NotificationClientError";
		this.status = status;
		this.body = body;
	}
}

const vapidPublicKeyResponseSchema = z.object({
	keyVersion: z.string().min(1),
	publicKey: z.string().min(1),
});

const notificationSettingsSchema = z.object({
	enabled: z.boolean(),
});

const registerNotificationDeviceResponseSchema = z.object({
	canonicalLinkedWalletAddresses: z.array(z.string()),
	deviceId: z.string().min(1),
	inboxSyncCursor: z.string(),
	notificationSettings: notificationSettingsSchema,
	status: z.string().min(1),
	subscriptionStatus: z.string().min(1),
});

const linkedWalletsResponseSchema = z.object({
	linkedWalletAddresses: z.array(z.string()),
});

const disableNotificationDeviceResponseSchema = z.object({
	deviceId: z.string().min(1),
	subscriptionStatus: z.string().min(1),
});

const ackResponseSchema = z.object({
	accepted: z.boolean(),
});

const notificationActionSchema = z.object({
	action: z.string(),
	title: z.string(),
});

const backendNotificationPayloadBaseSchema = z.object({
	actions: z.array(notificationActionSchema).optional(),
	body: z.string(),
	createdAt: z.string(),
	expiresAt: z.string().optional(),
	kind: notificationKindSchema,
	notificationId: z.string(),
	offRampReference: z.string().optional(),
	priority: notificationPrioritySchema.optional(),
	swapId: z.string().optional(),
	targetUrl: z.string(),
	title: z.string(),
	voucherId: z.string().optional(),
	walletAddressTarget: z.string().optional(),
});

const backendInboxMessageSchema = backendNotificationPayloadBaseSchema
	.extend({
		actionId: z.string().optional(),
		clickedAt: z.string().optional(),
		deviceId: z.string(),
		pushError: z.string().optional(),
		pushStatus: z.string(),
		pushStatusCode: z.number().optional(),
		receivedAt: z.string().optional(),
		recordId: z.string(),
		revision: z.number(),
		sentAt: z.string(),
		shownAt: z.string().optional(),
	})
	.transform(withDefaultPriority);

const syncNotificationInboxResponseSchema = z.object({
	deletedIds: z.array(z.string()),
	messages: z.array(backendInboxMessageSchema),
	nextSyncCursor: z.string(),
});

const devSendNotificationResponseSchema = z.object({
	notificationId: z.string(),
	recipients: z.array(
		z.object({
			deviceId: z.string(),
			error: z.string().optional(),
			status: z.string(),
			statusCode: z.number().optional(),
		}),
	),
});

const devDebugStateResponseSchema = z.object({
	allowOrigins: z.array(z.string()),
	keyVersion: z.string(),
	state: z.object({
		clickAcks: z.array(z.unknown()),
		deliveryAcks: z.array(z.unknown()),
		devices: z.record(z.string(), z.unknown()),
		messages: z.array(backendInboxMessageSchema),
		revision: z.number(),
	}),
	vapidPublicKey: z.string(),
});

export function getNotificationBackendBaseUrl(): string {
	const configured =
		(import.meta.env.VITE_WEBPUSH_BASE_URL as string | undefined) ??
		DEFAULT_WEBPUSH_BASE_URL;

	return trimTrailingSlashes(configured);
}

export async function fetchVapidPublicKey(
	options?: NotificationClientOptions,
): Promise<VapidPublicKeyResponse> {
	return notificationFetch(
		"/api/notifications/vapid-public-key",
		vapidPublicKeyResponseSchema,
		{ method: "GET" },
		options,
	);
}

export async function registerNotificationDevice(
	request: RegisterNotificationDeviceRequest,
	options?: NotificationClientOptions,
): Promise<RegisterNotificationDeviceResponse> {
	return notificationFetch(
		"/api/notifications/devices/register",
		registerNotificationDeviceResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

export async function linkNotificationWallet(
	request: LinkNotificationWalletRequest,
	options?: NotificationClientOptions,
): Promise<LinkNotificationWalletResponse> {
	return notificationFetch(
		"/api/notifications/devices/link-wallet",
		linkedWalletsResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

export async function unlinkNotificationWallet(
	request: LinkNotificationWalletRequest,
	options?: NotificationClientOptions,
): Promise<LinkNotificationWalletResponse> {
	return notificationFetch(
		"/api/notifications/devices/unlink-wallet",
		linkedWalletsResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

export async function disableNotificationDevice(
	request: DisableNotificationDeviceRequest,
	options?: NotificationClientOptions,
): Promise<DisableNotificationDeviceResponse> {
	return notificationFetch(
		"/api/notifications/devices/disable",
		disableNotificationDeviceResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

export async function sendNotificationDeliveryAck(
	request: SendNotificationDeliveryAckRequest,
	options?: NotificationClientOptions,
): Promise<NotificationAckResponse> {
	return notificationFetch(
		"/api/notifications/acks/delivery",
		ackResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

export async function sendNotificationClickAck(
	request: SendNotificationClickAckRequest,
	options?: NotificationClientOptions,
): Promise<NotificationAckResponse> {
	return notificationFetch(
		"/api/notifications/acks/click",
		ackResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

export async function syncNotificationInbox(
	request: SyncNotificationInboxRequest,
	options?: NotificationClientOptions,
): Promise<SyncNotificationInboxResponse> {
	return notificationFetch(
		"/api/notifications/inbox/sync",
		syncNotificationInboxResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

export async function devGetNotificationDebugState(
	options?: NotificationClientOptions,
): Promise<DevDebugStateResponse> {
	return notificationFetch(
		"/debug/state",
		devDebugStateResponseSchema,
		{ method: "GET" },
		options,
	);
}

export async function devSendNotification(
	request: DevSendNotificationRequest,
	options?: NotificationClientOptions,
): Promise<DevSendNotificationResponse> {
	return notificationFetch(
		"/debug/send",
		devSendNotificationResponseSchema,
		jsonRequest("POST", request),
		options,
	);
}

async function notificationFetch<Schema extends z.ZodType>(
	path: string,
	schema: Schema,
	init: RequestInit,
	options: NotificationClientOptions = {},
): Promise<z.infer<Schema>> {
	const fetcher = options.fetcher ?? fetch;
	const response = await fetcher(`${baseUrl(options)}${path}`, {
		...init,
		signal: options.signal ?? init.signal,
	});
	const body = await readJsonBody(response);

	if (!response.ok) {
		throw new NotificationClientError(
			errorMessageFromBody(body) ?? `Request failed with ${response.status}`,
			response.status,
			body,
		);
	}

	return schema.parse(body);
}

function jsonRequest(method: "POST", body: unknown): RequestInit {
	return {
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
		method,
	};
}

async function readJsonBody(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text.trim() === "") {
		return null;
	}

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function errorMessageFromBody(body: unknown): string | null {
	if (
		typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof body.error === "string"
	) {
		return body.error;
	}

	return null;
}

function baseUrl(options: NotificationClientOptions): string {
	return trimTrailingSlashes(
		options.baseUrl ?? getNotificationBackendBaseUrl(),
	);
}

function trimTrailingSlashes(value: string): string {
	return value.trim().replace(/\/+$/, "");
}

function withDefaultPriority<
	Payload extends {
		kind: NotificationKind;
		priority?: NotificationPriority;
	},
>(
	payload: Payload,
): Omit<Payload, "priority"> & {
	priority: NotificationPriority;
} {
	return {
		...payload,
		priority:
			payload.priority ?? getNotificationKindPolicy(payload.kind).priority,
	};
}
