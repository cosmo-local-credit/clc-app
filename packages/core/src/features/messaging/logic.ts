import { z } from "zod";
import { isHttpUrl } from "../../lib/contact";

/** Limits clc-core enforces in its schema; a value past them never leaves the device. */
export const MESSAGE_BODY_MAX = 2000;
export const MESSAGE_IMAGE_MAX = 4;
export const CONVERSATION_INTRO_MAX = 200;
export const ABUSE_REPORT_COMMENT_MAX = 1000;

const idSchema = z.number().int().positive();
const timestampSchema = z.string().datetime({ offset: true });
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const imageUrlSchema = z
  .string()
  .refine(isHttpUrl, { message: "The image must be an http(s) URL" });

export const peerSchema = z.object({
  address: addressSchema,
  username: z.string().nullable(),
  avatar: z.string().nullable(),
});
export type Peer = z.infer<typeof peerSchema>;

export const conversationKindSchema = z.enum(["direct", "helpdesk"]);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const conversationStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "revoked",
  "open",
  "resolved",
]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

/** A status a member of a direct conversation may set. */
export const directStatusChangeSchema = z.enum(["accepted", "declined", "revoked"]);
export type DirectStatusChange = z.infer<typeof directStatusChangeSchema>;

export const helpdeskStatusSchema = z.enum(["open", "resolved"]);
export type HelpdeskStatus = z.infer<typeof helpdeskStatusSchema>;

/** `sender` is relative to the caller; "support" is an admin reply in helpdesk. */
export const messageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  clientId: z.string().min(1),
  sender: z.enum(["self", "peer", "support"]),
  body: z.string().nullable(),
  imageUrls: z.array(imageUrlSchema).max(MESSAGE_IMAGE_MAX),
  createdAt: timestampSchema,
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: idSchema,
  kind: conversationKindSchema,
  status: conversationStatusSchema,
  peer: peerSchema.nullable(),
  intro: z.string().nullable(),
  requestedBySelf: z.boolean(),
  canAccept: z.boolean(),
  canRequest: z.boolean(),
  blocked: z.boolean(),
  lastMessage: messageSchema.nullable(),
  lastMessageAt: timestampSchema.nullable(),
  lastReadMessageId: z.number().int().nonnegative().nullable(),
  unreadCount: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationPageSchema = z.object({
  items: z.array(conversationSchema),
  nextCursor: z.string().nullable(),
});
export type ConversationPage = z.infer<typeof conversationPageSchema>;

/**
 * Messages ascend by id. Without `after`, `hasMore` says older messages exist;
 * with `after`, it says newer ones do.
 */
export const messagePageSchema = z.object({
  items: z.array(messageSchema),
  hasMore: z.boolean(),
});
export type MessagePage = z.infer<typeof messagePageSchema>;

export const unreadCountsSchema = z.object({
  direct: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  helpdesk: z.number().int().nonnegative(),
});
export type UnreadCounts = z.infer<typeof unreadCountsSchema>;

export const blockSchema = peerSchema.extend({ createdAt: timestampSchema });
export type Block = z.infer<typeof blockSchema>;

export const blockListSchema = z.object({ items: z.array(blockSchema) });

export const abuseReportCreatedSchema = z.object({ id: idSchema });

export const sendMessageInputSchema = z
  .object({
    clientId: z.uuid(),
    body: z.string().max(MESSAGE_BODY_MAX).optional(),
    imageUrls: z.array(imageUrlSchema).max(MESSAGE_IMAGE_MAX).optional(),
  })
  .refine((input) => (input.body?.trim() ?? "") !== "" || (input.imageUrls?.length ?? 0) > 0, {
    message: "A message needs text or an image",
  });
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const conversationRequestInputSchema = z.object({
  recipientAddress: addressSchema,
  intro: z.string().trim().max(CONVERSATION_INTRO_MAX).optional(),
});
export type ConversationRequestInput = z.infer<typeof conversationRequestInputSchema>;

export const abuseReportInputSchema = z.object({
  reportedAddress: addressSchema,
  messageId: idSchema.optional(),
  comment: z.string().trim().max(ABUSE_REPORT_COMMENT_MAX).optional(),
});
export type AbuseReportInput = z.infer<typeof abuseReportInputSchema>;

// Admin console.

export const adminMessageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  clientId: z.string().min(1),
  sender: z.enum(["user", "support"]),
  adminAddress: addressSchema.nullable(),
  body: z.string().nullable(),
  imageUrls: z.array(imageUrlSchema).max(MESSAGE_IMAGE_MAX),
  createdAt: timestampSchema,
});
export type AdminMessage = z.infer<typeof adminMessageSchema>;

export const adminMessagePageSchema = z.object({
  items: z.array(adminMessageSchema),
  hasMore: z.boolean(),
});
export type AdminMessagePage = z.infer<typeof adminMessagePageSchema>;

export const adminHelpdeskItemSchema = z.object({
  id: idSchema,
  status: helpdeskStatusSchema,
  user: peerSchema,
  lastMessage: adminMessageSchema.nullable(),
  lastMessageAt: timestampSchema.nullable(),
  needsReply: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type AdminHelpdeskItem = z.infer<typeof adminHelpdeskItemSchema>;

export const adminHelpdeskPageSchema = z.object({
  items: z.array(adminHelpdeskItemSchema),
  nextCursor: z.string().nullable(),
});
export type AdminHelpdeskPage = z.infer<typeof adminHelpdeskPageSchema>;

export const abuseReportStatusSchema = z.enum(["open", "dismissed", "actioned"]);
export type AbuseReportStatus = z.infer<typeof abuseReportStatusSchema>;

export const abuseReportResolutionSchema = z.enum(["dismissed", "actioned"]);
export type AbuseReportResolution = z.infer<typeof abuseReportResolutionSchema>;

export const adminAbuseReportSchema = z.object({
  id: idSchema,
  status: abuseReportStatusSchema,
  reporter: peerSchema,
  reported: peerSchema,
  message: z
    .object({
      id: idSchema,
      body: z.string().nullable(),
      imageUrls: z.array(imageUrlSchema).max(MESSAGE_IMAGE_MAX),
      createdAt: timestampSchema,
    })
    .nullable(),
  comment: z.string().nullable(),
  resolvedBy: addressSchema.nullable(),
  resolvedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type AdminAbuseReport = z.infer<typeof adminAbuseReportSchema>;

export const adminAbuseReportPageSchema = z.object({
  items: z.array(adminAbuseReportSchema),
  nextCursor: z.string().nullable(),
});
export type AdminAbuseReportPage = z.infer<typeof adminAbuseReportPageSchema>;

// Pure helpers.

/** What a thread holds in memory: messages ascending by id, and whether older ones exist. */
export type ThreadMessages<M extends { id: number } = Message> = {
  items: M[];
  hasOlder: boolean;
};

/** Joins two runs of messages by id, ascending, later copies replacing earlier ones. */
export function mergeMessages<M extends { id: number }>(
  current: readonly M[],
  incoming: readonly M[],
): M[] {
  const byId = new Map<number, M>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.id - right.id);
}

export function newestMessageId(items: readonly { id: number }[]): number | undefined {
  return items.at(-1)?.id;
}

/**
 * The body and images a composer would send, or null when there is nothing.
 * Whitespace-only text counts as no text, as clc-core's check does.
 */
export function buildMessageContent(
  body: string,
  imageUrls: readonly string[],
): { body?: string; imageUrls?: string[] } | null {
  const text = body.trim();
  if (text === "" && imageUrls.length === 0) return null;
  return {
    ...(text !== "" ? { body: text } : {}),
    ...(imageUrls.length > 0 ? { imageUrls: [...imageUrls] } : {}),
  };
}

/** Unread on the Messages sub-tab: direct messages plus requests waiting on the caller. */
export function messagesSectionUnread(counts: UnreadCounts | undefined): number {
  return counts ? counts.direct + counts.requests : 0;
}

export type ConversationActions = {
  canSend: boolean;
  canAccept: boolean;
  canDecline: boolean;
  canRevoke: boolean;
  canRequest: boolean;
  canBlock: boolean;
  canReport: boolean;
};

/** What the caller may do in a conversation, from its status and the server's flags. */
export function conversationActions(conversation: Conversation): ConversationActions {
  if (conversation.kind === "helpdesk") {
    return {
      canSend: true,
      canAccept: false,
      canDecline: false,
      canRevoke: false,
      canRequest: false,
      canBlock: false,
      canReport: false,
    };
  }
  const accepted = conversation.status === "accepted";
  const pendingForCaller = conversation.status === "pending" && conversation.canAccept;
  return {
    canSend: accepted && !conversation.blocked,
    canAccept: pendingForCaller && !conversation.blocked,
    canDecline: pendingForCaller,
    canRevoke: accepted,
    canRequest: conversation.canRequest && !conversation.blocked,
    canBlock: conversation.peer !== null,
    canReport: conversation.peer !== null,
  };
}

/**
 * The id to move the caller's read marker to once the newest message is on
 * screen, or null when the marker is already there. The server keeps the
 * marker monotonic, so a stale device sending an older id changes nothing.
 */
export function readMarkerTarget(
  newestId: number | undefined,
  lastReadMessageId: number | null | undefined,
): number | null {
  if (newestId === undefined) return null;
  return newestId > (lastReadMessageId ?? 0) ? newestId : null;
}
