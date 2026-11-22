import { QueryClient, skipToken } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import type { AdminMessagingClient, MessagingClient } from "./client";
import {
  adminHelpdeskMessagesQueryOptions,
  adminMessagingKeys,
  appendThreadMessage,
  conversationByPeerQueryOptions,
  conversationMessagesQueryOptions,
  loadOlderConversationMessages,
  messagingKeys,
  resourceTargetsQueryOptions,
} from "./queries";

const VIEWER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

it("disables recipient lookup for a guest and keeps signed-in results wallet-scoped", async () => {
  const resourceTargets = vi.fn().mockResolvedValue({ targets: [] });
  const client = { resourceTargets } as unknown as MessagingClient;
  const resource = { kind: "want" as const, resourceId: "42" };
  expect(resourceTargetsQueryOptions(client, undefined, resource).enabled).toBe(false);
  const none = resourceTargetsQueryOptions(client, undefined, undefined);
  expect(none.enabled).toBe(false);
  expect(none.queryFn).toBe(skipToken);
  expect(resourceTargets).not.toHaveBeenCalled();
  const options = resourceTargetsQueryOptions(client, VIEWER, resource);
  await new QueryClient().fetchQuery(options);
  expect(resourceTargets).toHaveBeenCalledWith(resource, expect.any(AbortSignal));
  expect(options.queryKey).not.toEqual(
    resourceTargetsQueryOptions(client, undefined, resource).queryKey,
  );
});

it("scopes a peer lookup by viewer and checks it matches the requested direct peer", async () => {
  const peer = "0xDEADBEEF00000000000000000000000000000001";
  const direct = { id: 7, kind: "direct", peer: { address: peer } };
  const list = vi.fn().mockResolvedValue({ items: [direct], nextCursor: null });
  const client = { list } as unknown as MessagingClient;
  const queryClient = new QueryClient();
  const options = conversationByPeerQueryOptions(client, VIEWER, peer);

  await expect(queryClient.fetchQuery(options)).resolves.toEqual(direct);
  expect(list).toHaveBeenCalledWith(
    { kind: "direct", peerAddress: peer.toLowerCase() },
    expect.any(AbortSignal),
  );
  expect(options.queryKey).toEqual(messagingKeys.peer(VIEWER.toLowerCase(), peer.toLowerCase()));
  expect(queryClient.getQueryData(messagingKeys.peer(peer, peer))).toBeUndefined();

  list.mockResolvedValue({
    items: [{ id: 5, kind: "direct", peer: { address: VIEWER } }],
    nextCursor: "ordinary-inbox-page",
  });
  await expect(queryClient.fetchQuery(options)).rejects.toThrow("exact peer result");
});

const message = (id: number) => ({
  id,
  conversationId: 3,
  clientId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  sender: "peer" as const,
  body: `m${id}`,
  imageUrls: [],
  createdAt: "2026-11-09T10:00:00Z",
});

function fakeClient(
  pages: Array<{ items: ReturnType<typeof message>[]; hasMore: boolean; clearedThrough?: number }>,
) {
  const messages = vi.fn(() => Promise.resolve(pages.shift() ?? { items: [], hasMore: false }));
  return { client: { messages } as unknown as MessagingClient, messages };
}

describe("conversation messages query", () => {
  it("does not recreate a deleted thread when an older-page request completes late", async () => {
    const queryClient = new QueryClient();
    const key = messagingKeys.messages(VIEWER, 3);
    queryClient.setQueryData(key, { items: [message(10)], hasOlder: true, fetchedThrough: 10 });
    let finish: (page: Page) => void = () => {};
    const messages = vi.fn(
      () =>
        new Promise<Page>((resolve) => {
          finish = resolve;
        }),
    );
    const client = { messages } as unknown as MessagingClient;
    const older = loadOlderConversationMessages(client, queryClient, VIEWER, 3);
    queryClient.removeQueries({ queryKey: key });
    finish({ items: [message(1)], hasMore: true });
    expect(await older).toBe(false);
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it("clears cached history on a remote deletion and resumes after the cutoff", async () => {
    const queryClient = new QueryClient();
    const { client, messages } = fakeClient([
      { items: [message(4), message(5)], hasMore: true },
      { items: [], hasMore: false, clearedThrough: 8 },
      { items: [message(9)], hasMore: false, clearedThrough: 8 },
    ]);
    const options = conversationMessagesQueryOptions(client, VIEWER, 3);
    await queryClient.fetchQuery(options);
    expect(await queryClient.fetchQuery({ ...options, staleTime: 0 })).toEqual({
      items: [],
      hasOlder: false,
      fetchedThrough: 8,
      clearedThrough: 8,
    });
    appendThreadMessage(queryClient, options.queryKey, message(5));
    expect(queryClient.getQueryData(options.queryKey)).toMatchObject({ items: [] });
    const renewed = await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(messages).toHaveBeenLastCalledWith(3, { after: 8, limit: 100 }, expect.anything());
    expect(renewed.items).toEqual([message(9)]);
    expect(renewed.hasOlder).toBe(false);
  });

  it("does not restore older pages or stale refreshes after a newer cutoff arrives", async () => {
    const queryClient = new QueryClient();
    const key = messagingKeys.messages(VIEWER, 3);
    queryClient.setQueryData(key, { items: [message(10)], hasOlder: true, fetchedThrough: 10 });
    let finishPoll: (page: Page) => void = () => {};
    let finishOlder: (page: Page) => void = () => {};
    const messages = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Page>((resolve) => {
            finishPoll = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Page>((resolve) => {
            finishOlder = resolve;
          }),
      );
    const client = { messages } as unknown as MessagingClient;
    const pending = queryClient.fetchQuery(conversationMessagesQueryOptions(client, VIEWER, 3));
    const older = loadOlderConversationMessages(client, queryClient, VIEWER, 3);
    await vi.waitFor(() => expect(messages).toHaveBeenCalledTimes(2));
    queryClient.setQueryData(key, {
      items: [],
      hasOlder: false,
      fetchedThrough: 12,
      clearedThrough: 12,
    });
    finishOlder({ items: [message(8), message(9)], hasMore: true });
    expect(await older).toBe(false);
    finishPoll({ items: [message(11)], hasMore: false });
    expect(await pending).toEqual({
      items: [],
      hasOlder: false,
      fetchedThrough: 12,
      clearedThrough: 12,
    });
  });

  it("opens on the newest page, then reads only after the newest id", async () => {
    const queryClient = new QueryClient();
    const { client, messages } = fakeClient([
      { items: [message(4), message(5)], hasMore: true },
      { items: [message(6)], hasMore: false },
    ]);
    const options = conversationMessagesQueryOptions(client, VIEWER, 3);

    const first = await queryClient.fetchQuery(options);
    expect(first).toEqual({ items: [message(4), message(5)], hasOlder: true, fetchedThrough: 5 });
    expect(messages).toHaveBeenLastCalledWith(3, { limit: 50 }, expect.anything());

    const second = await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(messages).toHaveBeenLastCalledWith(3, { after: 5, limit: 100 }, expect.anything());
    expect(second.items.map((item) => item.id)).toEqual([4, 5, 6]);
    expect(second.hasOlder).toBe(true);
  });

  it("follows hasMore forward until the backlog is read", async () => {
    const queryClient = new QueryClient();
    const { client, messages } = fakeClient([
      { items: [message(1)], hasMore: false },
      { items: [message(2)], hasMore: true },
      { items: [message(3)], hasMore: false },
    ]);
    const options = conversationMessagesQueryOptions(client, VIEWER, 3);
    await queryClient.fetchQuery(options);
    const data = await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(messages.mock.calls.map((args) => (args as unknown[])[1])).toEqual([
      { limit: 50 },
      { after: 1, limit: 100 },
      { after: 2, limit: 100 },
    ]);
    expect(data.items.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("keeps a sent message and older pages written while a refresh was in flight", async () => {
    const queryClient = new QueryClient();
    const key = messagingKeys.messages(VIEWER, 3);
    queryClient.setQueryData(key, { items: [message(10)], hasOlder: true, fetchedThrough: 10 });
    let release: (value: {
      items: ReturnType<typeof message>[];
      hasMore: boolean;
    }) => void = () => {};
    const messages = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockImplementationOnce(() =>
        Promise.resolve({ items: [message(8), message(9)], hasMore: false }),
      );
    const client = { messages } as unknown as MessagingClient;
    const refresh = queryClient.fetchQuery({
      ...conversationMessagesQueryOptions(client, VIEWER, 3),
      staleTime: 0,
    });
    await vi.waitFor(() => expect(messages).toHaveBeenCalledTimes(1));
    await loadOlderConversationMessages(client, queryClient, VIEWER, 3);
    appendThreadMessage(queryClient, key, message(12));
    release({ items: [message(11)], hasMore: false });
    const data = await refresh;
    expect(data.items.map((item) => item.id)).toEqual([8, 9, 10, 11, 12]);
    expect(data.hasOlder).toBe(false);
  });

  it("keys threads by viewer, case-insensitively", () => {
    expect(messagingKeys.messages(VIEWER, 3)).toEqual(
      messagingKeys.messages(VIEWER.toLowerCase(), 3),
    );
  });
});

type Page = { items: ReturnType<typeof message>[]; hasMore: boolean };
type FetchPage = (...args: unknown[]) => Promise<Page>;

/**
 * The user thread and the admin helpdesk thread share one refresh, so each
 * case runs on both. `read` is the first load, or a poll with `poll: true`.
 */
const threads = [
  {
    name: "user thread",
    setup: (queryClient: QueryClient, fetchPage: FetchPage) => {
      const options = conversationMessagesQueryOptions(
        { messages: fetchPage } as unknown as MessagingClient,
        VIEWER,
        3,
      );
      return {
        key: messagingKeys.messages(VIEWER, 3),
        read: (poll = false) =>
          queryClient.fetchQuery(poll ? { ...options, staleTime: 0 } : options),
      };
    },
  },
  {
    name: "admin helpdesk thread",
    setup: (queryClient: QueryClient, fetchPage: FetchPage) => {
      const options = adminHelpdeskMessagesQueryOptions(
        { helpdeskMessages: fetchPage } as unknown as AdminMessagingClient,
        3,
      );
      return {
        key: adminMessagingKeys.helpdeskMessages(3),
        read: (poll = false) =>
          queryClient.fetchQuery(poll ? { ...options, staleTime: 0 } : options),
      };
    },
  },
];

describe.each(threads)("$name after a send", ({ setup }) => {
  it("polls from the newest fetched id, so a message that landed before the send still arrives", async () => {
    const queryClient = new QueryClient();
    const fetchPage = vi
      .fn<(...args: unknown[]) => Promise<Page>>()
      .mockResolvedValueOnce({ items: [message(1)], hasMore: false })
      .mockResolvedValueOnce({ items: [message(2), message(3)], hasMore: false })
      .mockResolvedValue({ items: [], hasMore: false });
    const { key, read } = setup(queryClient, fetchPage);

    await read();
    // Message 2 reaches the server, then the caller sends 3 before the next poll.
    appendThreadMessage(queryClient, key, message(3));
    const data = await read(true);

    expect(fetchPage.mock.calls[1]?.[1]).toEqual({ after: 1, limit: 100 });
    expect(data.items.map((item) => item.id)).toEqual([1, 2, 3]);

    await read(true);
    expect(fetchPage.mock.calls[2]?.[1]).toEqual({ after: 3, limit: 100 });
  });

  it("keeps older history reachable when a send lands before the first page", async () => {
    const queryClient = new QueryClient();
    let release: (page: Page) => void = () => {};
    const fetchPage = vi
      .fn<(...args: unknown[]) => Promise<Page>>()
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockResolvedValue({ items: [], hasMore: false });
    const { key, read } = setup(queryClient, fetchPage);

    const initial = read();
    await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    appendThreadMessage(queryClient, key, message(60));
    release({ items: [message(10), message(59)], hasMore: true });
    const data = await initial;

    expect(data.items.map((item) => item.id)).toEqual([10, 59, 60]);
    expect(data.hasOlder).toBe(true);

    await read(true);
    expect(fetchPage.mock.calls[1]?.[1]).toEqual({ after: 59, limit: 100 });
  });
});
