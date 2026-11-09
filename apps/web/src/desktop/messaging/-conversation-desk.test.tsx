import { BackendApiError } from "@clc/api/client/errors";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useDeskTrail } from "#/desktop/trail";
import { stubIntersectionObserver } from "#/lib/-fixtures/intersection-observer";
import { AMINA, conversation, message, mountDesk, VIEWER } from "./-messaging-desk-fixtures";

const mocks = vi.hoisted(() => ({
  client: {
    unread: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    messages: vi.fn(),
    send: vi.fn(),
    markRead: vi.fn(),
    setStatus: vi.fn(),
    request: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
    report: vi.fn(),
  },
}));

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks.client }));
vi.mock("#/features/wallet/hooks/use-activity-unseen", () => ({
  useActivityUnseen: () => ({ count: 0 }),
  useActivityVisit: () => () => false,
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => ({ data: undefined }),
  useRecipientSearch: () => ({ data: undefined, isDebouncing: false, isFetching: false }),
}));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.unread.mockResolvedValue({ direct: 0, requests: 0, helpdesk: 0 });
  mocks.client.list.mockResolvedValue({
    items: [conversation(1), conversation(2)],
    nextCursor: null,
  });
  mocks.client.get.mockImplementation((id: number) => Promise.resolve(conversation(id)));
  mocks.client.messages.mockResolvedValue({ items: [], hasMore: false });
  mocks.client.markRead.mockResolvedValue(undefined);
});

describe("desktop thread", () => {
  it("opens a direct link beside the Messages list and names the peer in the breadcrumb", async () => {
    mocks.client.messages.mockResolvedValue({
      items: [message(7, 1, "peer", "Hello"), message(8, 1, "self", "Hi back")],
      hasMore: false,
    });
    mountDesk("/messages/1");

    expect(await screen.findByRole("heading", { name: "user1" })).toBeTruthy();
    expect(await screen.findByText("Hi back")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Messages/ }).getAttribute("aria-current")).toBe(
      "page",
    );
    await waitFor(() => expect(useDeskTrail.getState().label).toBe("user1"));
    await waitFor(() => expect(mocks.client.markRead).toHaveBeenCalledWith(1, 8));
  });

  it("waits for a newly arrived message to be on screen before marking it read", async () => {
    const observer = stubIntersectionObserver();
    mocks.client.get.mockImplementation((id: number) =>
      Promise.resolve(conversation(id, { lastReadMessageId: 6, unreadCount: 1 })),
    );
    mocks.client.messages.mockResolvedValueOnce({
      items: [message(6, 1), message(7, 1)],
      hasMore: false,
    });
    const { client } = mountDesk("/messages/1");
    const seventh = await screen.findByText("Message 7");
    act(() => observer.reveal(seventh));
    await waitFor(() => expect(mocks.client.markRead).toHaveBeenCalledWith(1, 7));

    mocks.client.messages.mockResolvedValueOnce({ items: [message(8, 1)], hasMore: false });
    await act(() => client.refetchQueries({ type: "active" }));
    expect(await screen.findByText("Message 8")).toBeTruthy();
    expect(mocks.client.markRead).toHaveBeenCalledOnce();

    act(() => observer.reveal(screen.getByText("Message 8")));
    await waitFor(() => expect(mocks.client.markRead).toHaveBeenLastCalledWith(1, 8));
  });

  it("moves between threads in place, so Back still returns to the inbox", async () => {
    const { router } = mountDesk("/?tab=activity&section=messages");
    fireEvent.click(await screen.findByRole("link", { name: /user1/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/1"));
    fireEvent.click(await screen.findByRole("link", { name: /user2/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/2"));
    expect(await screen.findByRole("heading", { name: "user2" })).toBeTruthy();

    router.history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({ tab: "activity", section: "messages" });
  });

  it("closes the thread from the selected Messages section", async () => {
    const { router } = mountDesk("/messages/1");
    await screen.findByRole("heading", { name: "user1" });
    fireEvent.click(screen.getByRole("link", { name: /^Messages/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByText("No conversation open")).toBeTruthy();
  });

  it("answers a request with Accept and Decline before any composer", async () => {
    const request = conversation(1, { status: "pending", canAccept: true, intro: "Hi, it's Juma" });
    mocks.client.get.mockResolvedValue(request);
    mocks.client.setStatus.mockResolvedValue(conversation(1));
    mountDesk("/messages/1");

    const panel = await screen.findByRole("region", { name: "Request" });
    expect(within(panel).getByText("Hi, it's Juma")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "Decline" })).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mocks.client.setStatus).toHaveBeenCalledWith(1, "accepted"));
    expect(await screen.findByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Request" })).toBeNull();
  });

  it("waits on the other person for a request the caller sent", async () => {
    mocks.client.get.mockResolvedValue(
      conversation(1, { status: "pending", requestedBySelf: true }),
    );
    mountDesk("/messages/1");
    expect(await screen.findByText("Waiting for them to accept your request.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("sends with Enter and keeps a new line on Shift+Enter", async () => {
    mocks.client.send.mockResolvedValue(message(20, 1, "self", "On my way"));
    mountDesk("/messages/1");
    const box = await screen.findByRole("textbox", { name: "Message" });

    fireEvent.change(box, { target: { value: "On my way" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(mocks.client.send).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() =>
      expect(mocks.client.send).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ body: "On my way", clientId: expect.any(String) }),
      ),
    );
    expect(await screen.findByText("On my way", { selector: "p" })).toBeTruthy();
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
  });

  it("keeps the draft when a send fails", async () => {
    mocks.client.send.mockRejectedValue(new BackendApiError(400, "bad"));
    mountDesk("/messages/1");
    const box = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "Are you open?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Couldn't send. Your message is kept; send it again."),
    ).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("Are you open?");
  });

  it("blocks the peer from the thread menu after confirming", async () => {
    mocks.client.block.mockResolvedValue(undefined);
    mountDesk("/messages/1");
    fireEvent.click(await screen.findByRole("button", { name: "Conversation options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Block" }));

    const dialog = await screen.findByRole("dialog", { name: "Block this person?" });
    expect(mocks.client.block).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Block" }));
    await waitFor(() => expect(mocks.client.block).toHaveBeenCalledWith(AMINA));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reports the peer's newest message with a comment", async () => {
    mocks.client.messages.mockResolvedValue({
      items: [message(7, 1, "peer", "Spam"), message(8, 1, "self", "Stop")],
      hasMore: false,
    });
    mocks.client.report.mockResolvedValue({ id: 1 });
    mountDesk("/messages/1");
    await screen.findByText("Spam");
    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Report" }));

    const dialog = await screen.findByRole("dialog", { name: "Report this person" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "What happened?" }), {
      target: { value: "Selling fake vouchers" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
    await waitFor(() =>
      expect(mocks.client.report).toHaveBeenCalledWith({
        reportedAddress: AMINA,
        messageId: 7,
        comment: "Selling fake vouchers",
      }),
    );
  });

  it("keeps a revoked history readable and offers to ask again", async () => {
    mocks.client.get.mockResolvedValue(
      conversation(1, { status: "revoked", requestedBySelf: true, canRequest: true }),
    );
    mocks.client.messages.mockResolvedValue({ items: [message(7, 1)], hasMore: false });
    mountDesk("/messages/1");
    expect(await screen.findByText("This conversation was revoked.")).toBeTruthy();
    expect(screen.getByText("Message 7")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask to talk again" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
  });

  it("answers a missing or foreign conversation with one message", async () => {
    mocks.client.get.mockRejectedValue(new BackendApiError(404, "not found"));
    mocks.client.messages.mockRejectedValue(new BackendApiError(404, "not found"));
    mountDesk("/messages/99");
    expect(await screen.findByText("This conversation isn't available.")).toBeTruthy();
    // The list beside it still works.
    expect(await screen.findByRole("link", { name: /user1/ })).toBeTruthy();
  });

  it("keeps the messages it has when a later poll fails", async () => {
    mocks.client.messages.mockResolvedValueOnce({ items: [message(7, 1)], hasMore: false });
    const { client } = mountDesk("/messages/1");
    expect(await screen.findByText("Message 7")).toBeTruthy();
    mocks.client.messages.mockRejectedValue(new BackendApiError(503, "unavailable"));
    await act(() => client.refetchQueries({ type: "active" }).catch(() => undefined));
    expect(screen.getByText("Message 7")).toBeTruthy();
    expect(screen.queryByText("Couldn't load messages.")).toBeNull();
  });

  it("opens a helpdesk link in Helpdesk, without the Messages list", async () => {
    mocks.client.get.mockResolvedValue(
      conversation(11, { kind: "helpdesk", status: "resolved", peer: null }),
    );
    mocks.client.messages.mockResolvedValue({
      items: [message(31, 11, "support", "Fixed now")],
      hasMore: false,
    });
    mountDesk("/messages/11");
    expect(await screen.findByText("Fixed now")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Support/ })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /^Helpdesk/ }).getAttribute("aria-current")).toBe(
        "page",
      ),
    );
    expect(screen.queryByRole("button", { name: "New message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Conversation options" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
  });
});
