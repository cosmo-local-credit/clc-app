import { BackendApiError } from "@clc/api/client/errors";
import type { Conversation, Message } from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";
const PEER = {
  address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
  username: "amina",
  avatar: null,
};

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  messages: vi.fn(),
  send: vi.fn(),
  markRead: vi.fn(),
  setStatus: vi.fn(),
  request: vi.fn(),
  block: vi.fn(),
  unblock: vi.fn(),
  report: vi.fn(),
}));

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks }));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));

import { stubIntersectionObserver } from "#/lib/-fixtures/intersection-observer";
import { ThreadPage } from "./thread-page";

function message(id: number, sender: Message["sender"] = "peer", body = `Message ${id}`): Message {
  return {
    id,
    conversationId: 5,
    clientId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    sender,
    body,
    imageUrls: [],
    createdAt: "2026-11-09T10:00:00Z",
  };
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 5,
    kind: "direct",
    status: "accepted",
    peer: PEER,
    intro: null,
    requestedBySelf: false,
    canAccept: false,
    canRequest: false,
    blocked: false,
    lastMessage: null,
    lastMessageAt: null,
    lastReadMessageId: null,
    unreadCount: 0,
    createdAt: "2026-11-09T09:00:00Z",
    updatedAt: "2026-11-09T09:00:00Z",
    ...overrides,
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: Outlet });
  const thread = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <ThreadPage conversationId={5} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([thread]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.markRead.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ThreadPage", () => {
  it("shows the loading state while the first reads are pending", async () => {
    mocks.get.mockReturnValue(new Promise(() => {}));
    mocks.messages.mockReturnValue(new Promise(() => {}));
    mount();
    expect(await screen.findByText("Loading conversation…")).toBeTruthy();
  });

  it("shows an empty accepted thread with its composer", async () => {
    mocks.get.mockResolvedValue(conversation());
    mocks.messages.mockResolvedValue({ items: [], hasMore: false });
    mount();
    expect(await screen.findByText("No messages yet.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "amina" })).toBeTruthy();
  });

  it("offers a retry when the conversation fails to load", async () => {
    mocks.get.mockRejectedValueOnce(new BackendApiError(500, "boom"));
    mocks.messages.mockResolvedValue({ items: [], hasMore: false });
    mount();
    expect(await screen.findByText("Couldn't load this conversation.")).toBeTruthy();
    mocks.get.mockResolvedValue(conversation());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "amina" })).toBeTruthy();
  });

  it("answers a missing or foreign conversation with one message", async () => {
    mocks.get.mockRejectedValue(new BackendApiError(404, "not found"));
    mocks.messages.mockRejectedValue(new BackendApiError(404, "not found"));
    mount();
    expect(await screen.findByText("This conversation isn't available.")).toBeTruthy();
  });

  it("keeps the messages it has when a later poll fails", async () => {
    mocks.get.mockResolvedValue(conversation({ lastReadMessageId: 2 }));
    mocks.messages.mockResolvedValueOnce({ items: [message(1), message(2)], hasMore: false });
    const client = mount();
    expect(await screen.findByText("Message 2")).toBeTruthy();
    mocks.messages.mockRejectedValue(new BackendApiError(503, "unavailable"));
    await act(() => client.refetchQueries({ type: "active" }).catch(() => undefined));
    expect(screen.getByText("Message 1")).toBeTruthy();
    expect(screen.getByText("Message 2")).toBeTruthy();
    expect(screen.queryByText("Couldn't load messages.")).toBeNull();
  });

  it("reads only after the newest message when it refreshes", async () => {
    mocks.get.mockResolvedValue(conversation({ lastReadMessageId: 2 }));
    mocks.messages.mockResolvedValueOnce({ items: [message(1), message(2)], hasMore: false });
    const client = mount();
    await screen.findByText("Message 2");
    mocks.messages.mockResolvedValueOnce({ items: [message(3)], hasMore: false });
    await act(() => client.refetchQueries({ type: "active" }));
    expect(await screen.findByText("Message 3")).toBeTruthy();
    expect(mocks.messages).toHaveBeenLastCalledWith(5, { after: 2, limit: 100 }, expect.anything());
  });

  it("moves the read marker to the newest message once it is shown", async () => {
    mocks.get.mockResolvedValue(conversation({ lastReadMessageId: 1, unreadCount: 2 }));
    mocks.messages.mockResolvedValue({
      items: [message(1), message(2), message(3)],
      hasMore: false,
    });
    mount();
    await screen.findByText("Message 3");
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith(5, 3));
    expect(mocks.markRead).toHaveBeenCalledOnce();
  });

  it("waits for a newly arrived message to be on screen before marking it read", async () => {
    const observer = stubIntersectionObserver();
    mocks.get.mockResolvedValue(conversation({ lastReadMessageId: 1, unreadCount: 1 }));
    mocks.messages.mockResolvedValueOnce({ items: [message(1), message(2)], hasMore: false });
    const client = mount();
    const second = await screen.findByText("Message 2");
    act(() => observer.reveal(second));
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith(5, 2));

    mocks.messages.mockResolvedValueOnce({ items: [message(3)], hasMore: false });
    await act(() => client.refetchQueries({ type: "active" }));
    expect(await screen.findByText("Message 3")).toBeTruthy();
    expect(mocks.markRead).toHaveBeenCalledOnce();

    act(() => observer.reveal(screen.getByText("Message 3")));
    await waitFor(() => expect(mocks.markRead).toHaveBeenLastCalledWith(5, 3));
  });

  it("opens a pending request with Accept and Decline", async () => {
    mocks.get.mockResolvedValue(
      conversation({ status: "pending", canAccept: true, intro: "Hi, I sell maize." }),
    );
    mocks.messages.mockResolvedValue({ items: [], hasMore: false });
    mocks.setStatus.mockResolvedValue(conversation());
    mount();
    expect(await screen.findByText("Hi, I sell maize.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith(5, "accepted"));
    expect(await screen.findByRole("textbox", { name: "Message" })).toBeTruthy();
  });

  it("tells the requester they are waiting", async () => {
    mocks.get.mockResolvedValue(conversation({ status: "pending", requestedBySelf: true }));
    mocks.messages.mockResolvedValue({ items: [], hasMore: false });
    mount();
    expect(await screen.findByText("Waiting for them to accept your request.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("shows support replies as Support in a helpdesk thread", async () => {
    mocks.get.mockResolvedValue(conversation({ kind: "helpdesk", status: "open", peer: null }));
    mocks.messages.mockResolvedValue({
      items: [message(1, "self", "Help please"), message(2, "support", "On it")],
      hasMore: false,
    });
    mount();
    expect(await screen.findByText("On it")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Support" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conversation options" })).toBeNull();
  });

  it("retries a failed send with the same client id, then clears the draft", async () => {
    mocks.get.mockResolvedValue(conversation());
    mocks.messages.mockResolvedValue({ items: [], hasMore: false });
    mount();
    const field = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(field, { target: { value: "Hello there" } });
    mocks.send.mockRejectedValueOnce(new BackendApiError(400, "rejected"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Couldn't send. Your message is kept; send it again."),
    ).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe("Hello there");

    mocks.send.mockResolvedValueOnce(message(9, "self", "Hello there"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hello there", { selector: "p" })).toBeTruthy();
    const [first, second] = mocks.send.mock.calls as Array<
      [number, { clientId: string; body: string }]
    >;
    expect(first?.[1]).toMatchObject({ body: "Hello there" });
    expect(second?.[1].clientId).toBe(first?.[1].clientId);
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(""));
  });
});
