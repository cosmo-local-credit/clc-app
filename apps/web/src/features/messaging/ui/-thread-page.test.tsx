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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  delete: vi.fn(),
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
import { ThreadMenuSheet } from "./thread-menu-sheet";
import { ThreadPage } from "./thread-page";

function message(id: number, sender: Message["sender"] = "peer", body = `Message ${id}`): Message {
  return {
    id,
    conversationId: 5,
    clientId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    sender,
    body,
    imageUrls: [],
    context: null,
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

function mount(content = <ThreadPage conversationId={5} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: Outlet });
  const thread = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
      section: typeof search.section === "string" ? search.section : undefined,
    }),
    component: function Thread() {
      const search = thread.useSearch() as unknown as { section?: string };
      return search.section === "messages" ? <h1>Messages inbox</h1> : content;
    },
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
  it("never exposes peer actions when the menu receives a Helpdesk conversation", async () => {
    mount(
      <>
        <h1>Helpdesk controls</h1>
        <ThreadMenuSheet
          conversation={conversation({ kind: "helpdesk", status: "open", peer: null })}
          messages={[]}
        />
      </>,
    );
    await screen.findByRole("heading", { name: "Helpdesk controls" });
    expect(screen.queryByRole("button", { name: "Conversation options" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("confirms deletion, keeps the dialog usable after failure and returns to Messages on success", async () => {
    mocks.get.mockResolvedValue(conversation({ status: "pending", requestedBySelf: true }));
    mocks.messages.mockResolvedValue({ items: [message(1)], hasMore: false });
    mocks.delete.mockRejectedValueOnce(new BackendApiError(503, "unavailable"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Conversation options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const title = "Are you sure you want to delete this conversation?";
    const dialog = await screen.findByRole("dialog", { name: title });
    expect(mocks.delete).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Conversation options" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: title })).getByRole("button", {
        name: "Delete",
      }),
    );
    expect(await screen.findByText("That didn't work. Try again.")).toBeTruthy();

    let finish: () => void = () => {};
    mocks.delete.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const pending = await screen.findByRole("button", { name: "Deleting…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
    fireEvent.click(pending);
    expect(mocks.delete).toHaveBeenCalledTimes(2);
    await act(async () => finish());
    expect(await screen.findByRole("heading", { name: "Messages inbox" })).toBeTruthy();
    expect(mocks.delete).toHaveBeenLastCalledWith(5);
    expect(screen.queryByText("Message 1")).toBeNull();
  });

  it.each(["Revoke", "Block", "Report"] as const)(
    "preserves the %s action alongside Delete",
    async (action) => {
      mocks.get.mockResolvedValue(conversation());
      mocks.messages.mockResolvedValue({ items: [message(1)], hasMore: false });
      mocks.setStatus.mockResolvedValue(conversation({ status: "revoked" }));
      mocks.block.mockResolvedValue(undefined);
      mocks.report.mockResolvedValue({ id: 1 });
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "Conversation options" }));
      fireEvent.click(await screen.findByRole("button", { name: action }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(
        within(dialog).getByRole("button", { name: action === "Report" ? "Send report" : action }),
      );
      if (action === "Revoke") {
        await waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith(5, "revoked"));
      } else if (action === "Block") {
        await waitFor(() => expect(mocks.block).toHaveBeenCalledWith(PEER.address));
      } else {
        await waitFor(() =>
          expect(mocks.report).toHaveBeenCalledWith({
            reportedAddress: PEER.address,
            messageId: 1,
          }),
        );
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(mocks.delete).not.toHaveBeenCalled();
    },
  );

  it("refreshes consent after a stale send is rejected following deletion by the peer", async () => {
    mocks.get.mockResolvedValueOnce(conversation()).mockResolvedValue(
      conversation({
        status: "revoked",
        canRequest: true,
      }),
    );
    mocks.messages.mockResolvedValue({ items: [], hasMore: false });
    mocks.send.mockRejectedValueOnce(new BackendApiError(409, "the conversation is not accepted"));
    mount();
    fireEvent.change(await screen.findByRole("textbox", { name: "Message" }), {
      target: { value: "Hello again" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("button", { name: "Ask to talk again" })).toBeTruthy();
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
  });

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
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mocks.get.mockRejectedValue(new BackendApiError(500, "boom"));
    mocks.messages.mockResolvedValue({ items: [], hasMore: false });
    mount();
    await act(() => vi.advanceTimersByTimeAsync(3_501));
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Couldn't load this conversation.")).toBeTruthy();
    mocks.get.mockResolvedValue(conversation());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("heading", { name: "amina" })).toBeTruthy();
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
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mocks.messages.mockRejectedValue(new BackendApiError(503, "unavailable"));
    await act(async () => {
      const refresh = client.refetchQueries({ type: "active" });
      await vi.advanceTimersByTimeAsync(999);
      expect(mocks.messages).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2_502);
      await refresh;
    });
    expect(mocks.messages).toHaveBeenCalledTimes(4);
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

  it("retries a failed read marker even when the polls that follow are unchanged", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mocks.get.mockResolvedValue(conversation({ lastReadMessageId: 1, unreadCount: 1 }));
    mocks.messages.mockResolvedValue({ items: [message(1), message(2)], hasMore: false });
    mocks.markRead.mockRejectedValueOnce(new BackendApiError(503, "unavailable"));
    const client = mount();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("Message 2")).toBeTruthy();
    expect(mocks.markRead).toHaveBeenCalledOnce();
    // An identical poll keeps every effect dependency equal.
    await act(() => client.refetchQueries({ type: "active" }));
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(mocks.markRead).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(2));
    expect(mocks.markRead).toHaveBeenCalledTimes(2);
    expect(mocks.markRead).toHaveBeenLastCalledWith(5, 2);
  });

  it("does not retry a read marker the server rejected", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mocks.get.mockResolvedValue(conversation({ lastReadMessageId: 1, unreadCount: 1 }));
    mocks.messages.mockResolvedValue({ items: [message(1), message(2)], hasMore: false });
    mocks.markRead.mockRejectedValueOnce(new BackendApiError(403, "forbidden"));
    mount();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("Message 2")).toBeTruthy();
    expect(mocks.markRead).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1_500));
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

  it("opens a pending request with Accept and Decline, and keeps the intro once accepted", async () => {
    mocks.get.mockResolvedValue(
      conversation({ status: "pending", canAccept: true, intro: "Hi, I sell maize." }),
    );
    // The intro is the requester's first message, not a separate field on screen.
    mocks.messages.mockResolvedValue({
      items: [message(1, "peer", "Hi, I sell maize.")],
      hasMore: false,
    });
    mocks.setStatus.mockResolvedValue(conversation());
    mount();
    expect(await screen.findByText("Hi, I sell maize.")).toBeTruthy();
    expect(screen.getAllByText("Hi, I sell maize.")).toHaveLength(1);
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith(5, "accepted"));
    expect(await screen.findByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.getByText("Hi, I sell maize.")).toBeTruthy();
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
