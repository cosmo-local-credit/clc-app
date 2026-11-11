import { z } from "zod";

import type { UserRole } from "../users/roles";

/** The longest retirement or moderation reason clc-core accepts. */
export const MAX_ACCOUNT_REASON_LENGTH = 2000;

const accountLifecycleSchema = z.enum([
  "ACTIVE",
  "RETIREMENT_SCHEDULED",
  "ERASURE_PENDING",
  "ERASED",
]);
export type AccountLifecycle = z.infer<typeof accountLifecycleSchema>;

/**
 * What the server lets this session do. Clients render these rather than
 * inferring permission from one status field.
 */
const sessionCapabilitiesSchema = z.object({
  canUseApp: z.boolean(),
  canRecoverAssets: z.boolean(),
  canTransferResources: z.boolean(),
  canRestoreAccount: z.boolean(),
});
export type SessionCapabilities = z.infer<typeof sessionCapabilitiesSchema>;

/** The capabilities of an account with no retirement, for a backend that omits them. */
export const FULL_CAPABILITIES: SessionCapabilities = {
  canUseApp: true,
  canRecoverAssets: true,
  canTransferResources: true,
  canRestoreAccount: false,
};

/**
 * The one thing a public voucher or pool says about its managing account: that it
 * is scheduled to close, or has. It names no account and carries no reason.
 */
export const managerClosureSchema = z
  .object({
    state: z.enum(["SCHEDULED", "CLOSED"]),
    closesAt: z.string().nullable(),
  })
  .nullable();
export type ManagerClosure = z.infer<typeof managerClosureSchema>;

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const accountRetirementSchema = z.object({
  id: z.number().int().positive(),
  state: accountLifecycleSchema.exclude(["ACTIVE"]),
  requestedAt: z.string(),
  closesAt: z.string(),
  reason: z.string(),
  requestSource: z.enum(["SELF", "ADMIN"]),
  restoredAt: z.string().nullable(),
  version: z.number().int().positive(),
});

export const accountLifecycleEventSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["retired", "restored"]),
  source: z.enum(["SELF", "ADMIN"]),
  actorAddress: addressSchema.nullable(),
  createdAt: z.string(),
});
export type AccountLifecycleEvent = z.infer<typeof accountLifecycleEventSchema>;

export const moderationEventSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["ban", "unban"]),
  previousStatus: z.string(),
  newStatus: z.string(),
  reason: z.string(),
  actorAddress: addressSchema.nullable(),
  createdAt: z.string(),
});
export type ModerationEvent = z.infer<typeof moderationEventSchema>;

/**
 * What a retirement would hide and leave in place. Balances are not summarised
 * by the backend; `balancesCoverage` says so instead of presenting a partial list
 * as complete.
 */
export const accountRetirementPreviewSchema = z.object({
  closesAt: z.string(),
  recoveryMonths: z.number().int().positive(),
  ownedResources: z
    .array(
      z.object({
        resourceType: z.enum(["voucher", "pool"]),
        address: addressSchema,
        name: z.string(),
        active: z.boolean(),
      }),
    )
    .nullable()
    .transform((value) => value ?? []),
  pendingResourceRequests: z.number().int().nonnegative(),
  hiddenContent: z.object({
    wants: z.number().int().nonnegative(),
    catalogs: z.number().int().nonnegative(),
    posts: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
  }),
  balancesCoverage: z.string(),
  balancesCoverageNote: z.string(),
  pendingOperationsNote: z.string(),
});
export type AccountRetirementPreview = z.infer<typeof accountRetirementPreviewSchema>;

/** The body shared by every retire and restore response. */
export const accountLifecycleStateSchema = z.object({
  accountLifecycle: accountLifecycleSchema,
  closesAt: z.string().nullable(),
  capabilities: sessionCapabilitiesSchema,
  retirement: accountRetirementSchema.nullable(),
});
export type AccountLifecycleState = z.infer<typeof accountLifecycleStateSchema>;

/** A session that is limited to recovery actions. */
export function isRecoveryLifecycle(lifecycle: AccountLifecycle | undefined): boolean {
  return lifecycle !== undefined && lifecycle !== "ACTIVE";
}

/**
 * Whether `caller` may Ban, Unban or retire `target`. An Admin acts on Users, a
 * Superadmin on Users and Admins, and nobody acts on a Superadmin or on
 * themselves. clc-core enforces this; the console uses it only to decide which
 * buttons to offer.
 */
export function mayActOnAccount(
  caller: { role: UserRole; address: string },
  target: { role: UserRole; address: string },
): boolean {
  if (caller.address.toLowerCase() === target.address.toLowerCase()) return false;
  if (caller.role === "SUPERADMIN") return target.role === "USER" || target.role === "ADMIN";
  if (caller.role === "ADMIN") return target.role === "USER";
  return false;
}
