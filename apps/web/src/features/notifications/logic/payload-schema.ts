import { z } from "zod";
import { normalizeNotificationTargetUrl } from "./target-url";

export const notificationKinds = [
  "voucher.received",
  "swap.completed",
  "offramp.completed",
] as const;

export const notificationKindSchema = z.enum(notificationKinds);

export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationPrioritySchema = z.enum(["very-low", "low", "normal", "high"]);

export type NotificationPriority = z.infer<typeof notificationPrioritySchema>;

export type NotificationInteractionMode = "click-only";
export type NotificationSettingsScope = "device";
export type NotificationSignOutPolicy = "retain-until-explicit-disable";

export type NotificationKindPolicy = {
  interactionMode: NotificationInteractionMode;
  priority: NotificationPriority;
  renotify: boolean;
  settingsScope: NotificationSettingsScope;
  signOutPolicy: NotificationSignOutPolicy;
};

const sharedV1Policy = {
  interactionMode: "click-only",
  settingsScope: "device",
  signOutPolicy: "retain-until-explicit-disable",
} as const;

export const notificationKindPolicies = {
  "voucher.received": {
    ...sharedV1Policy,
    priority: "high",
    renotify: true,
  },
  "swap.completed": {
    ...sharedV1Policy,
    priority: "normal",
    renotify: true,
  },
  "offramp.completed": {
    ...sharedV1Policy,
    priority: "high",
    renotify: true,
  },
} satisfies Record<NotificationKind, NotificationKindPolicy>;

export function getNotificationKindPolicy(kind: NotificationKind): NotificationKindPolicy {
  return notificationKindPolicies[kind];
}

export const notificationActionSchema = z.object({
  action: trimmedString().min(1).max(64),
  title: trimmedString().min(1).max(64),
});

export type NotificationAction = z.infer<typeof notificationActionSchema>;

export type NotificationPayload = {
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

export type NotificationPayloadParseResult =
  | {
      payload: NotificationPayload;
      rawPayload: unknown;
      success: true;
    }
  | {
      error: z.ZodError;
      rawPayload: unknown;
      success: false;
    };

export type ParseNotificationPayloadOptions = {
  appOrigin?: string;
};

const isoTimestampSchema = z.string().datetime({ offset: true });
const walletAddressSchema = trimmedString().regex(/^0x[a-fA-F0-9]{40}$/);
const optionalWalletAddressSchema = optionalTrimmedString().pipe(walletAddressSchema.optional());
const optionalIdSchema = optionalTrimmedString().pipe(trimmedString().min(1).max(128).optional());

const notificationOptionalMetadataSchema = z.object({
  actions: z.array(notificationActionSchema).max(2).optional(),
  expiresAt: optionalTrimmedString().pipe(isoTimestampSchema.optional()),
  offRampReference: optionalIdSchema,
  swapId: optionalIdSchema,
  voucherId: optionalIdSchema,
});

export function parseNotificationPayload(
  rawPayload: unknown,
  options: ParseNotificationPayloadOptions = {},
): NotificationPayloadParseResult {
  const requiredResult = createRequiredNotificationPayloadSchema(options.appOrigin).safeParse(
    rawPayload,
  );

  if (!requiredResult.success) {
    return {
      error: requiredResult.error,
      rawPayload,
      success: false,
    };
  }

  const metadataResult = notificationOptionalMetadataSchema.safeParse(rawPayload);
  const metadata = metadataResult.success ? metadataResult.data : {};

  return {
    payload: {
      ...requiredResult.data,
      ...metadata,
    },
    rawPayload,
    success: true,
  };
}

function createRequiredNotificationPayloadSchema(appOrigin?: string) {
  return z
    .object({
      body: trimmedString().min(1).max(240),
      createdAt: isoTimestampSchema,
      kind: notificationKindSchema,
      notificationId: trimmedString().min(1).max(128),
      priority: notificationPrioritySchema.optional(),
      targetUrl: z.string().transform((value, context) => {
        const normalized = normalizeNotificationTargetUrl(value, appOrigin);

        if (!normalized) {
          context.addIssue({
            code: "custom",
            message: "targetUrl must be relative or same-origin",
          });
          return z.NEVER;
        }

        return normalized;
      }),
      title: trimmedString().min(1).max(120),
      walletAddressTarget: optionalWalletAddressSchema,
    })
    .transform((payload) => ({
      ...payload,
      priority: payload.priority ?? getNotificationKindPolicy(payload.kind).priority,
    }));
}

function optionalTrimmedString() {
  return z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().optional());
}

function trimmedString() {
  return z.string().trim();
}
