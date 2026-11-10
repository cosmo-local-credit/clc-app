import type {
  AdminAbuseReport,
  AdminHelpdeskItem,
  AdminMessage,
  Peer,
} from "@clc/core/features/messaging/logic";
import { QueryClient } from "@tanstack/react-query";

const USER: Peer = {
  address: "0x1111111111111111111111111111111111111111",
  username: "amina",
  avatar: null,
};

export const OTHER_USER: Peer = {
  address: "0x2222222222222222222222222222222222222222",
  username: "baraka",
  avatar: null,
};

export const OPERATOR = "0x3333333333333333333333333333333333333333";
export const OTHER_OPERATOR = "0x4444444444444444444444444444444444444444";

export function message(id: number, overrides: Partial<AdminMessage> = {}): AdminMessage {
  return {
    id,
    conversationId: 7,
    clientId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    sender: "user",
    adminAddress: null,
    body: `Message ${id}`,
    imageUrls: [],
    createdAt: "2026-11-09T10:00:00Z",
    ...overrides,
  };
}

export function helpdeskItem(
  id: number,
  overrides: Partial<AdminHelpdeskItem> = {},
): AdminHelpdeskItem {
  return {
    id,
    status: "open",
    user: USER,
    lastMessage: message(100 + id, { conversationId: id }),
    lastMessageAt: "2026-11-09T10:00:00Z",
    needsReply: true,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-09T10:00:00Z",
    ...overrides,
  };
}

export function abuseReport(
  id: number,
  overrides: Partial<AdminAbuseReport> = {},
): AdminAbuseReport {
  return {
    id,
    status: "open",
    reporter: USER,
    reported: OTHER_USER,
    message: {
      id: 900 + id,
      body: "Send me your PIN",
      imageUrls: ["https://storage.example/report/abc_1280_hash.webp"],
      createdAt: "2026-11-08T09:00:00Z",
    },
    comment: "Asked for my PIN",
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-11-08T10:00:00Z",
    ...overrides,
  };
}

/** A real QueryClient as the app configures it, minus retries so a failure shows at once. */
export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** A promise that never settles, for the pending state. */
export function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}
