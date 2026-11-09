import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import type { MessagingClient } from "./client";
import {
  appendThreadMessage,
  conversationMessagesQueryOptions,
  loadOlderConversationMessages,
  messagingKeys,
} from "./queries";

const VIEWER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

const message = (id: number) => ({
  id,
  conversationId: 3,
  clientId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  sender: "peer" as const,
  body: `m${id}`,
  imageUrls: [],
  createdAt: "2026-11-09T10:00:00Z",
});

function fakeClient(pages: Array<{ items: ReturnType<typeof message>[]; hasMore: boolean }>) {
  const messages = vi.fn(() => Promise.resolve(pages.shift() ?? { items: [], hasMore: false }));
  return { client: { messages } as unknown as MessagingClient, messages };
}

describe("conversation messages query", () => {
  it("opens on the newest page, then reads only after the newest id", async () => {
    const queryClient = new QueryClient();
    const { client, messages } = fakeClient([
      { items: [message(4), message(5)], hasMore: true },
      { items: [message(6)], hasMore: false },
    ]);
    const options = conversationMessagesQueryOptions(client, VIEWER, 3);

    const first = await queryClient.fetchQuery(options);
    expect(first).toEqual({ items: [message(4), message(5)], hasOlder: true });
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
    queryClient.setQueryData(key, { items: [message(10)], hasOlder: true });
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
