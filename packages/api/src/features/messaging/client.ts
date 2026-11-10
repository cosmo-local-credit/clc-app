/**
 * Messaging and helpdesk on clc-core: the caller's conversations under
 * `/api/v2`, and the helpdesk and abuse-report queues under `/api/v2/admin`.
 *
 * Every response is parsed against the shared schemas, so a contract change
 * fails at the boundary instead of somewhere in a screen.
 */

import {
  abuseReportCreatedSchema,
  type AbuseReportInput,
  type AbuseReportResolution,
  type AbuseReportStatus,
  adminAbuseReportPageSchema,
  adminAbuseReportSchema,
  adminHelpdeskItemSchema,
  adminHelpdeskPageSchema,
  adminMessagePageSchema,
  adminMessagingCountsSchema,
  adminMessageSchema,
  blockListSchema,
  type ConversationKind,
  conversationPageSchema,
  type ConversationRequestInput,
  conversationSchema,
  type DirectStatusChange,
  type HelpdeskStatus,
  messagePageSchema,
  messageSchema,
  type SendMessageInput,
  unreadCountsSchema,
} from "@clc/core/features/messaging/logic";

import type { HttpClient } from "../../client/http-client";

export type ConversationListParams = {
  kind?: ConversationKind;
  cursor?: string;
  limit?: number;
};

/** `before` and `after` are message ids and exclusive; the server refuses both together. */
export type MessagePageParams = {
  before?: number;
  after?: number;
  limit?: number;
};

const NO_STORE = { cache: "no-store" } as const;

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.size > 0 ? `${path}?${query}` : path;
}

function messagePagePath(base: string, params: MessagePageParams): string {
  if (params.before !== undefined && params.after !== undefined) {
    throw new Error("A message page takes before or after, not both");
  }
  return withQuery(base, { before: params.before, after: params.after, limit: params.limit });
}

const conversationPath = (id: number) => `/api/v2/conversations/${encodeURIComponent(id)}`;
const blockPath = (address: string) => `/api/v2/blocks/${encodeURIComponent(address)}`;

export function createMessagingClient(http: HttpClient) {
  return {
    async list(params: ConversationListParams = {}, signal?: AbortSignal) {
      const path = withQuery("/api/v2/conversations", {
        kind: params.kind,
        cursor: params.cursor,
        limit: params.limit,
      });
      return conversationPageSchema.parse(await http.request(path, { ...NO_STORE, signal }));
    },

    async unread(signal?: AbortSignal) {
      return unreadCountsSchema.parse(
        await http.request("/api/v2/conversations/unread", { ...NO_STORE, signal }),
      );
    },

    /** Asks to message someone. clc-core answers one 404 for unknown, unapproved and blocked. */
    async request(input: ConversationRequestInput) {
      return conversationSchema.parse(
        await http.request("/api/v2/conversations", {
          ...NO_STORE,
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },

    async get(id: number, signal?: AbortSignal) {
      return conversationSchema.parse(
        await http.request(conversationPath(id), { ...NO_STORE, signal }),
      );
    },

    async setStatus(id: number, status: DirectStatusChange) {
      return conversationSchema.parse(
        await http.request(`${conversationPath(id)}/status`, {
          ...NO_STORE,
          method: "PUT",
          body: JSON.stringify({ status }),
        }),
      );
    },

    async messages(id: number, params: MessagePageParams = {}, signal?: AbortSignal) {
      return messagePageSchema.parse(
        await http.request(messagePagePath(`${conversationPath(id)}/messages`, params), {
          ...NO_STORE,
          signal,
        }),
      );
    },

    /** Retry-safe: a repeated `clientId` returns the message already stored. */
    async send(id: number, input: SendMessageInput) {
      return messageSchema.parse(
        await http.request(`${conversationPath(id)}/messages`, {
          ...NO_STORE,
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },

    async markRead(id: number, lastReadMessageId: number) {
      await http.request(`${conversationPath(id)}/read`, {
        ...NO_STORE,
        method: "PUT",
        body: JSON.stringify({ lastReadMessageId }),
      });
    },

    /** The caller's helpdesk conversation, created on first use. */
    async helpdesk() {
      return conversationSchema.parse(
        await http.request("/api/v2/helpdesk", { ...NO_STORE, method: "POST", body: "{}" }),
      );
    },

    async blocks(signal?: AbortSignal) {
      return blockListSchema.parse(await http.request("/api/v2/blocks", { ...NO_STORE, signal }))
        .items;
    },

    async block(address: string) {
      await http.request(blockPath(address), { ...NO_STORE, method: "PUT" });
    },

    async unblock(address: string) {
      await http.request(blockPath(address), { ...NO_STORE, method: "DELETE" });
    },

    async report(input: AbuseReportInput) {
      return abuseReportCreatedSchema.parse(
        await http.request("/api/v2/abuse-reports", {
          ...NO_STORE,
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },
  };
}

export type MessagingClient = ReturnType<typeof createMessagingClient>;

export type AdminQueueParams<Status extends string> = {
  status?: Status;
  cursor?: string;
  limit?: number;
};

const helpdeskPath = (id: number) => `/api/v2/admin/helpdesk/${encodeURIComponent(id)}`;

export function createAdminMessagingClient(http: HttpClient) {
  return {
    async counts(signal?: AbortSignal) {
      return adminMessagingCountsSchema.parse(
        await http.request("/api/v2/admin/messaging/counts", { ...NO_STORE, signal }),
      );
    },

    async helpdeskQueue(params: AdminQueueParams<HelpdeskStatus> = {}, signal?: AbortSignal) {
      const path = withQuery("/api/v2/admin/helpdesk", {
        status: params.status,
        cursor: params.cursor,
        limit: params.limit,
      });
      return adminHelpdeskPageSchema.parse(await http.request(path, { ...NO_STORE, signal }));
    },

    async helpdeskItem(id: number, signal?: AbortSignal) {
      return adminHelpdeskItemSchema.parse(
        await http.request(helpdeskPath(id), { ...NO_STORE, signal }),
      );
    },

    async helpdeskMessages(id: number, params: MessagePageParams = {}, signal?: AbortSignal) {
      return adminMessagePageSchema.parse(
        await http.request(messagePagePath(`${helpdeskPath(id)}/messages`, params), {
          ...NO_STORE,
          signal,
        }),
      );
    },

    /** Retry-safe in the same way as a user's send. */
    async reply(id: number, input: SendMessageInput) {
      return adminMessageSchema.parse(
        await http.request(`${helpdeskPath(id)}/messages`, {
          ...NO_STORE,
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },

    async setHelpdeskStatus(id: number, status: HelpdeskStatus) {
      return adminHelpdeskItemSchema.parse(
        await http.request(`${helpdeskPath(id)}/status`, {
          ...NO_STORE,
          method: "PUT",
          body: JSON.stringify({ status }),
        }),
      );
    },

    async abuseReports(params: AdminQueueParams<AbuseReportStatus> = {}, signal?: AbortSignal) {
      const path = withQuery("/api/v2/admin/abuse-reports", {
        status: params.status,
        cursor: params.cursor,
        limit: params.limit,
      });
      return adminAbuseReportPageSchema.parse(await http.request(path, { ...NO_STORE, signal }));
    },

    async resolveAbuseReport(id: number, status: AbuseReportResolution) {
      return adminAbuseReportSchema.parse(
        await http.request(`/api/v2/admin/abuse-reports/${encodeURIComponent(id)}`, {
          ...NO_STORE,
          method: "PUT",
          body: JSON.stringify({ status }),
        }),
      );
    },
  };
}

export type AdminMessagingClient = ReturnType<typeof createAdminMessagingClient>;
