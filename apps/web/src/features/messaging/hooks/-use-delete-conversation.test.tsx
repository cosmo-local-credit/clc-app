import { adminMessagingKeys, messagingKeys } from "@clc/api/features/messaging/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";
const mocks = vi.hoisted(() => ({ delete: vi.fn(), viewer: "" as string | undefined }));
vi.mock("./use-messaging-viewer", () => ({ useMessagingViewer: () => mocks.viewer }));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks }));

import { useDeleteConversation } from "./use-conversation-actions";

beforeEach(() => {
  mocks.viewer = ALICE;
  mocks.delete.mockReset();
});

function mount(client: QueryClient) {
  return renderHook(() => useDeleteConversation(7), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

it("cancels in-flight history and removes only the deleting viewer's thread after account switching", async () => {
  const client = new QueryClient();
  const thread = messagingKeys.messages(ALICE, 7);
  client.setQueryData(thread, { items: [{ id: 1 }], hasOlder: false });
  client.setQueryData(messagingKeys.conversation(ALICE, 7), { id: 7 });
  client.setQueryData(messagingKeys.messages(ALICE, 8), { items: [{ id: 8 }] });
  client.setQueryData(messagingKeys.messages(BOB, 7), { items: [{ id: 1 }] });
  client.setQueryData(adminMessagingKeys.helpdeskMessages(7), { items: [{ id: 9 }] });
  const lists = messagingKeys.list(ALICE, "direct");
  const unread = messagingKeys.unread(ALICE);
  const receipts = messagingKeys.postRequests(ALICE);
  client.setQueryData(lists, {
    pages: [{ items: [{ id: 7 }, { id: 8 }], nextCursor: "next" }],
    pageParams: [undefined],
  });
  client.setQueryData(unread, {});
  client.setQueryData([...receipts, "list"], {
    pages: [{ items: [{ conversationId: 7 }, { conversationId: null }], nextCursor: null }],
    pageParams: [undefined],
  });
  let aborted = false;
  const poll = client
    .fetchQuery({
      queryKey: thread,
      staleTime: 0,
      queryFn: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(signal.reason);
          });
        }),
    })
    .catch(() => undefined);
  let finish: () => void = () => {};
  mocks.delete.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = mount(client);
  act(() => result.current.mutate());
  await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith(7));
  mocks.viewer = BOB;
  rerender();
  await act(async () => finish());
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await poll;
  expect(aborted).toBe(true);
  expect(client.getQueryData(thread)).toBeUndefined();
  expect(client.getQueryData(messagingKeys.conversation(ALICE, 7))).toBeUndefined();
  expect(client.getQueryData(messagingKeys.messages(ALICE, 8))).toEqual({ items: [{ id: 8 }] });
  expect(client.getQueryData(messagingKeys.messages(BOB, 7))).toEqual({ items: [{ id: 1 }] });
  expect(client.getQueryData(adminMessagingKeys.helpdeskMessages(7))).toEqual({
    items: [{ id: 9 }],
  });
  expect(client.getQueryData(lists)).toMatchObject({
    pages: [{ items: [{ id: 8 }], nextCursor: "next" }],
  });
  expect(client.getQueryData([...receipts, "list"])).toMatchObject({
    pages: [{ items: [{ conversationId: null }] }],
  });
  for (const key of [lists, unread, [...receipts, "list"]])
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});

it("preserves history when deletion fails", async () => {
  const client = new QueryClient();
  const key = messagingKeys.messages(ALICE, 7);
  client.setQueryData(key, { items: [{ id: 1 }] });
  mocks.delete.mockRejectedValueOnce(new Error("offline"));
  const { result } = mount(client);
  act(() => result.current.mutate());
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(client.getQueryData(key)).toEqual({ items: [{ id: 1 }] });
});

it("leaves other accounts' cached threads alone when no viewer is resolved", async () => {
  const client = new QueryClient();
  const key = messagingKeys.messages(ALICE, 7);
  client.setQueryData(key, { items: [{ id: 1 }] });
  mocks.viewer = undefined;
  mocks.delete.mockResolvedValueOnce(undefined);
  const { result } = mount(client);
  act(() => result.current.mutate());
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(client.getQueryData(key)).toEqual({ items: [{ id: 1 }] });
});
