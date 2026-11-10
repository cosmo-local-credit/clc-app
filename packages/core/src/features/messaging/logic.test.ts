import { describe, expect, it } from "vite-plus/test";
import {
  adminAbuseReportSchema,
  adminHelpdeskItemSchema,
  buildMessageContent,
  conversationActions,
  conversationPageSchema,
  conversationSchema,
  type Conversation,
  mergeMessages,
  messagePageSchema,
  messagesSectionUnread,
  readMarkerTarget,
  sendMessageInputSchema,
  unreadCountsSchema,
} from "./logic";

const PEER = {
  address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
  username: "amina",
  avatar: null,
};

const message = (id: number, sender: "self" | "peer" | "support" = "peer") => ({
  id,
  conversationId: 9,
  clientId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  sender,
  body: `Message ${id}`,
  imageUrls: [],
  createdAt: "2026-11-09T10:00:00Z",
});

const conversation = (overrides: Partial<Conversation> = {}): Conversation =>
  conversationSchema.parse({
    id: 9,
    kind: "direct",
    status: "accepted",
    peer: PEER,
    intro: null,
    requestedBySelf: false,
    canAccept: false,
    canRequest: false,
    blocked: false,
    lastMessage: message(3),
    lastMessageAt: "2026-11-09T10:00:00Z",
    lastReadMessageId: 2,
    unreadCount: 1,
    createdAt: "2026-11-09T09:00:00Z",
    updatedAt: "2026-11-09T10:00:00Z",
    ...overrides,
  });

describe("messaging wire schemas", () => {
  it("parses a conversation page with a helpdesk row that has no peer", () => {
    const page = conversationPageSchema.parse({
      items: [
        conversation(),
        { ...conversation(), id: 10, kind: "helpdesk", status: "open", peer: null },
      ],
      nextCursor: null,
    });
    expect(page.items.map((item) => item.kind)).toEqual(["direct", "helpdesk"]);
  });

  it("rejects an image that is not an absolute http(s) URL", () => {
    expect(
      messagePageSchema.safeParse({
        items: [{ ...message(1), imageUrls: ["javascript:alert(1)"] }],
        hasMore: false,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown sender", () => {
    expect(
      messagePageSchema.safeParse({ items: [{ ...message(1), sender: "admin" }], hasMore: false })
        .success,
    ).toBe(false);
  });

  it("parses the unread counts", () => {
    expect(unreadCountsSchema.parse({ direct: 2, requests: 1, helpdesk: 0 })).toEqual({
      direct: 2,
      requests: 1,
      helpdesk: 0,
    });
  });

  it("parses admin rows", () => {
    expect(
      adminHelpdeskItemSchema.parse({
        id: 4,
        status: "open",
        user: PEER,
        lastMessage: { ...message(1), sender: "user", adminAddress: null },
        lastMessageAt: "2026-11-09T10:00:00Z",
        needsReply: true,
        createdAt: "2026-11-09T10:00:00Z",
        updatedAt: "2026-11-09T10:00:00Z",
      }).needsReply,
    ).toBe(true);
    expect(
      adminAbuseReportSchema.parse({
        id: 1,
        status: "open",
        reporter: PEER,
        reported: { ...PEER, username: null },
        message: null,
        comment: null,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: "2026-11-09T10:00:00Z",
      }).status,
    ).toBe("open");
  });
});

describe("sendMessageInputSchema", () => {
  const clientId = "0f8c2a7e-1d2b-4c3d-8e4f-5a6b7c8d9e0f";

  it("needs text or an image", () => {
    expect(sendMessageInputSchema.safeParse({ clientId, body: "  " }).success).toBe(false);
    expect(sendMessageInputSchema.safeParse({ clientId, body: "Hi" }).success).toBe(true);
    expect(
      sendMessageInputSchema.safeParse({ clientId, imageUrls: ["https://s.test/a.webp"] }).success,
    ).toBe(true);
  });

  it("caps the body and the image count", () => {
    expect(sendMessageInputSchema.safeParse({ clientId, body: "x".repeat(2001) }).success).toBe(
      false,
    );
    expect(
      sendMessageInputSchema.safeParse({
        clientId,
        imageUrls: Array.from({ length: 5 }, (_, i) => `https://s.test/${i}.webp`),
      }).success,
    ).toBe(false);
  });

  it("needs a UUID client id", () => {
    expect(sendMessageInputSchema.safeParse({ clientId: "1", body: "Hi" }).success).toBe(false);
  });
});

describe("mergeMessages", () => {
  it("joins runs ascending by id without duplicates", () => {
    const merged = mergeMessages([message(1), message(3)], [message(3), message(2), message(4)]);
    expect(merged.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("buildMessageContent", () => {
  it("returns null for nothing to send", () => {
    expect(buildMessageContent("   ", [])).toBeNull();
  });

  it("trims text and keeps images", () => {
    expect(buildMessageContent(" hi ", ["https://s.test/a.webp"])).toEqual({
      body: "hi",
      imageUrls: ["https://s.test/a.webp"],
    });
    expect(buildMessageContent("", ["https://s.test/a.webp"])).toEqual({
      imageUrls: ["https://s.test/a.webp"],
    });
  });
});

describe("conversationActions", () => {
  it("lets the recipient of a pending request accept or decline", () => {
    const actions = conversationActions(conversation({ status: "pending", canAccept: true }));
    expect(actions).toMatchObject({ canAccept: true, canDecline: true, canSend: false });
  });

  it("does not let the requester accept their own request", () => {
    const actions = conversationActions(
      conversation({ status: "pending", requestedBySelf: true, canAccept: false }),
    );
    expect(actions).toMatchObject({ canAccept: false, canDecline: false, canSend: false });
  });

  it("stops sending once the caller has blocked the peer, but keeps revoke", () => {
    expect(conversationActions(conversation({ blocked: true }))).toMatchObject({
      canSend: false,
      canRevoke: true,
    });
  });

  it("offers a new request only to whoever declined or revoked", () => {
    expect(
      conversationActions(conversation({ status: "revoked", canRequest: true })).canRequest,
    ).toBe(true);
    expect(conversationActions(conversation({ status: "revoked" })).canRequest).toBe(false);
  });

  it("lets a helpdesk user always send, with no peer actions", () => {
    expect(
      conversationActions(conversation({ kind: "helpdesk", status: "resolved", peer: null })),
    ).toMatchObject({ canSend: true, canBlock: false, canReport: false, canRevoke: false });
  });
});

describe("read markers and section counts", () => {
  it("moves the marker only forward", () => {
    expect(readMarkerTarget(5, 3)).toBe(5);
    expect(readMarkerTarget(5, 5)).toBeNull();
    expect(readMarkerTarget(5, null)).toBe(5);
    expect(readMarkerTarget(undefined, null)).toBeNull();
  });

  it("counts requests on the Messages sub-tab", () => {
    expect(messagesSectionUnread({ direct: 2, requests: 1, helpdesk: 4 })).toBe(3);
    expect(messagesSectionUnread(undefined)).toBe(0);
  });
});
