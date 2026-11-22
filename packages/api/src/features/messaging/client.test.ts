import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { createAdminMessagingClient, createMessagingClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

const PEER = {
  address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
  username: "amina",
  avatar: null,
};
const MESSAGE = {
  id: 7,
  conversationId: 3,
  clientId: "0f8c2a7e-1d2b-4c3d-8e4f-5a6b7c8d9e0f",
  sender: "self",
  body: "Hello",
  imageUrls: [],
  createdAt: "2026-11-09T10:00:00Z",
};
const CONVERSATION = {
  id: 3,
  kind: "direct",
  status: "pending",
  peer: PEER,
  intro: "Hi there",
  requestedBySelf: true,
  canAccept: false,
  canRequest: false,
  blocked: false,
  lastMessage: null,
  lastMessageAt: null,
  lastReadMessageId: null,
  unreadCount: 0,
  createdAt: "2026-11-09T10:00:00Z",
  updatedAt: "2026-11-09T10:00:00Z",
};

function stub(result: unknown, status = 200) {
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify({ ok: true, result }), { status }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function call(fetcher: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetcher.mock.calls[index]! as [string, RequestInit];
  const parsed = new URL(url);
  return {
    path: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams),
    method: init.method ?? "GET",
    body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    cache: init.cache,
  };
}

const http = () => createHttpClient({ baseUrl: "https://api.test" });

describe("messaging client", () => {
  it("looks up contextual recipients by resource without an owner address", async () => {
    const fetcher = stub({ targets: [PEER] });
    await expect(
      createMessagingClient(http()).resourceTargets({
        kind: "want",
        resourceId: "42",
      }),
    ).resolves.toEqual({ targets: [PEER] });
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/messaging/resource-targets",
      query: { kind: "want", resourceId: "42" },
      cache: "no-store",
    });
  });

  it("uses the private Post request endpoints with an ID and no recipient address", async () => {
    const item = {
      id: MESSAGE.clientId,
      postId: "42",
      postTitle: "Community garden",
      direction: "outgoing",
      status: "pending",
      intro: "Hello",
      conversationId: null,
      requester: null,
      createdAt: MESSAGE.createdAt,
    };
    const client = createMessagingClient(http());
    const create = stub(item, 201);
    await expect(client.requestPostContact({ postId: "42", intro: "Hello" })).resolves.toEqual(
      item,
    );
    expect(call(create)).toMatchObject({
      path: "/api/v2/messaging/post-requests",
      method: "POST",
      body: { postId: "42", intro: "Hello" },
      cache: "no-store",
    });
    const list = stub({ items: [item], nextCursor: null });
    await expect(client.postRequests("page2")).resolves.toEqual({
      items: [item],
      nextCursor: null,
    });
    expect(call(list)).toMatchObject({
      path: "/api/v2/messaging/post-requests",
      query: { cursor: "page2" },
      cache: "no-store",
    });
    const update = stub({
      ...item,
      direction: "incoming",
      requester: PEER,
      status: "accepted",
      conversationId: 3,
    });
    await expect(client.setPostRequestStatus(item.id, "accepted")).resolves.toMatchObject({
      status: "accepted",
      conversationId: 3,
    });
    expect(call(update)).toMatchObject({
      path: `/api/v2/messaging/post-requests/${item.id}/status`,
      method: "PUT",
      body: { status: "accepted" },
      cache: "no-store",
    });
  });

  it("lists conversations by kind and cursor, uncached", async () => {
    const fetcher = stub({ items: [CONVERSATION], nextCursor: "c2" });
    const page = await createMessagingClient(http()).list({ kind: "direct", cursor: "c1" });
    expect(page.nextCursor).toBe("c2");
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/conversations",
      query: { kind: "direct", cursor: "c1" },
      cache: "no-store",
    });
  });

  it("looks up an exact direct peer without an inbox cursor", async () => {
    const fetcher = stub({ items: [CONVERSATION], nextCursor: null });
    await createMessagingClient(http()).list({ kind: "direct", peerAddress: PEER.address });
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/conversations",
      query: { kind: "direct", peerAddress: PEER.address },
      cache: "no-store",
    });
    expect(call(fetcher).query).not.toHaveProperty("cursor");
  });

  it("requests a conversation by address", async () => {
    const fetcher = stub(CONVERSATION, 201);
    await createMessagingClient(http()).request({ recipientAddress: PEER.address, intro: "Hi" });
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/conversations",
      method: "POST",
      body: { recipientAddress: PEER.address, intro: "Hi" },
    });
  });

  it("reads messages after the newest id, and refuses before with after", async () => {
    const fetcher = stub({ items: [MESSAGE], hasMore: false });
    const client = createMessagingClient(http());
    await client.messages(3, { after: 6, limit: 100 });
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/conversations/3/messages",
      query: { after: "6", limit: "100" },
    });
    await expect(client.messages(3, { after: 1, before: 9 })).rejects.toThrow();
  });

  it("sends with the client id and moves the read marker", async () => {
    const fetcher = stub(MESSAGE, 201);
    const client = createMessagingClient(http());
    await client.send(3, { clientId: MESSAGE.clientId, body: "Hello" });
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/conversations/3/messages",
      method: "POST",
      body: { clientId: MESSAGE.clientId, body: "Hello" },
    });
    stub(null, 204);
    await expect(client.markRead(3, 7)).resolves.toBeUndefined();
  });

  it("changes status, starts helpdesk, blocks and reports", async () => {
    const fetcher = stub({ ...CONVERSATION, status: "accepted" });
    const client = createMessagingClient(http());
    await client.setStatus(3, "accepted");
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/conversations/3/status",
      method: "PUT",
      body: { status: "accepted" },
    });

    const helpdesk = stub({ ...CONVERSATION, kind: "helpdesk", status: "open", peer: null });
    await client.helpdesk();
    expect(call(helpdesk)).toMatchObject({ path: "/api/v2/helpdesk", method: "POST" });

    const block = stub(null, 204);
    await client.block(PEER.address);
    await client.unblock(PEER.address);
    expect(call(block, 0)).toMatchObject({ path: `/api/v2/blocks/${PEER.address}`, method: "PUT" });
    expect(call(block, 1)).toMatchObject({ method: "DELETE" });

    const report = stub({ id: 1 }, 201);
    await client.report({ reportedAddress: PEER.address, messageId: 7, comment: "spam" });
    expect(call(report)).toMatchObject({
      path: "/api/v2/abuse-reports",
      body: { reportedAddress: PEER.address, messageId: 7, comment: "spam" },
    });
  });

  it("fails at the boundary when a response breaks the contract", async () => {
    stub({ direct: 1, requests: "two", helpdesk: 0 });
    await expect(createMessagingClient(http()).unread()).rejects.toThrow();
  });
});

describe("admin messaging client", () => {
  it("reads the helpdesk queue and replies under /admin", async () => {
    const fetcher = stub({ items: [], nextCursor: null });
    const admin = createAdminMessagingClient(http());
    await admin.helpdeskQueue({ status: "open" });
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/admin/helpdesk",
      query: { status: "open" },
    });

    const reply = stub({ ...MESSAGE, sender: "support", adminAddress: PEER.address }, 201);
    await admin.reply(4, { clientId: MESSAGE.clientId, body: "On it" });
    expect(call(reply)).toMatchObject({
      path: "/api/v2/admin/helpdesk/4/messages",
      method: "POST",
    });
  });

  it("resolves an abuse report", async () => {
    const fetcher = stub({
      id: 2,
      status: "dismissed",
      reporter: PEER,
      reported: PEER,
      message: null,
      comment: null,
      resolvedBy: PEER.address,
      resolvedAt: "2026-11-09T10:00:00Z",
      createdAt: "2026-11-09T10:00:00Z",
    });
    await createAdminMessagingClient(http()).resolveAbuseReport(2, "dismissed");
    expect(call(fetcher)).toMatchObject({
      path: "/api/v2/admin/abuse-reports/2",
      method: "PUT",
      body: { status: "dismissed" },
    });
  });
});
