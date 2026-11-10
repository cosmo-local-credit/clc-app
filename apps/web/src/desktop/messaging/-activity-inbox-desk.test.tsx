import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AMINA, conversation, message, mountDesk, VIEWER } from "./-messaging-desk-fixtures";

const mocks = vi.hoisted(() => ({
  enabled: { value: true },
  client: {
    unread: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    messages: vi.fn(),
    markRead: vi.fn(),
    helpdesk: vi.fn(),
    request: vi.fn(),
  },
  getAccountActivity: vi.fn(),
  visit: vi.fn(),
  inbox: vi.fn(),
  search: vi.fn(),
}));

vi.mock("#/lib/messaging-config", () => ({
  get MESSAGING_ENABLED() {
    return mocks.enabled.value;
  },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks.client }));
vi.mock("#/lib/api/accounts", () => ({
  accountsClient: { getAccountActivity: mocks.getAccountActivity },
}));
vi.mock("#/features/wallet/hooks/use-activity-unseen", () => ({
  useActivityUnseen: () => ({ count: 2 }),
  useActivityVisit: (shown: unknown) => {
    mocks.visit(shown);
    return () => false;
  },
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useReverseRecipientResolution: () => ({ data: undefined }),
  useRecipientSearch: (query: string | null) => mocks.search(query),
}));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/features/notifications/storage/notification-db", () => ({
  isNotificationStorageAvailable: () => true,
  listNotificationInboxMessages: mocks.inbox,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.value = true;
  mocks.client.unread.mockResolvedValue({ direct: 3, requests: 1, helpdesk: 2 });
  mocks.client.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.client.markRead.mockResolvedValue(undefined);
  mocks.getAccountActivity.mockResolvedValue({ activity: [], last: undefined });
  mocks.inbox.mockResolvedValue([]);
  mocks.search.mockReturnValue({ data: undefined, isDebouncing: false, isFetching: false });
});

function sections() {
  return screen.getByRole("navigation", { name: "Activity sections" });
}

describe("desktop Activity sections", () => {
  it("names each section with its own count", async () => {
    mountDesk("/?tab=activity&section=messages");
    const nav = await screen.findByRole("navigation", { name: "Activity sections" });
    expect(await within(nav).findByRole("link", { name: "Messages, 4 new" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Helpdesk, 2 new" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Transactions, 2 new" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Notifications" })).toBeTruthy();
    expect(
      within(nav).getByRole("link", { name: "Messages, 4 new" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("leaves Transactions unseen while Activity is open on another section", async () => {
    const { router } = mountDesk("/?tab=activity&section=messages");
    expect(await screen.findByText("No messages yet.")).toBeTruthy();
    expect(mocks.visit).not.toHaveBeenCalled();
    expect(mocks.getAccountActivity).not.toHaveBeenCalled();

    fireEvent.click(within(sections()).getByRole("link", { name: /^Transactions/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "activity" }));
    await screen.findByRole("table", { name: "Activity" });
    expect(mocks.visit).toHaveBeenCalled();
  });

  it("pushes history between sections, so Back returns to the previous one", async () => {
    const { router } = mountDesk("/?tab=activity");
    await screen.findByRole("navigation", { name: "Activity sections" });
    fireEvent.click(await within(sections()).findByRole("link", { name: /^Helpdesk/ }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "activity", section: "helpdesk" }),
    );
    router.history.back();
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "activity" }));
  });

  it("is the Transactions table alone while messaging is off", async () => {
    mocks.enabled.value = false;
    mountDesk("/?tab=activity&section=messages");
    expect(await screen.findByRole("table", { name: "Activity" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Activity sections" })).toBeNull();
    expect(mocks.client.unread).not.toHaveBeenCalled();
    expect(mocks.client.list).not.toHaveBeenCalled();
  });
});

describe("desktop Messages", () => {
  it("lists requests waiting on the caller apart from the other conversations", async () => {
    mocks.client.list.mockResolvedValue({
      items: [
        conversation(1, { unreadCount: 3, lastMessage: message(9, 1, "peer", "See you at 5") }),
        conversation(2, { status: "pending", canAccept: true, intro: "Hi, it's Juma" }),
      ],
      nextCursor: null,
    });
    mountDesk("/?tab=activity&section=messages");

    const requests = await screen.findByRole("region", { name: "Message requests" });
    expect(within(requests).getByRole("link", { name: /user2/ })).toBeTruthy();
    expect(within(requests).getByText("Hi, it's Juma")).toBeTruthy();
    const others = screen.getByRole("region", { name: "Conversations" });
    expect(within(others).getByRole("link", { name: /user1, 3 new/ })).toBeTruthy();
    expect(screen.getByText("No conversation open")).toBeTruthy();
    expect(mocks.client.list).toHaveBeenCalledWith(
      { kind: "direct", cursor: undefined },
      expect.anything(),
    );
  });

  it("offers a retry when the list fails", async () => {
    mocks.client.list.mockRejectedValueOnce(new Error("down"));
    mountDesk("/?tab=activity&section=messages");
    expect(await screen.findByText("Couldn't load messages.")).toBeTruthy();
    mocks.client.list.mockResolvedValue({ items: [conversation(1)], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /user1/ })).toBeTruthy();
  });

  it("opens a thread beside the list, and Back returns to the inbox", async () => {
    mocks.client.list.mockResolvedValue({ items: [conversation(1)], nextCursor: null });
    mocks.client.get.mockResolvedValue(conversation(1));
    mocks.client.messages.mockResolvedValue({ items: [message(4, 1)], hasMore: false });
    const { router } = mountDesk("/?tab=activity&section=messages");

    fireEvent.click(await screen.findByRole("link", { name: /user1/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/1"));
    expect(await screen.findByRole("heading", { name: "user1" })).toBeTruthy();
    expect(await screen.findByText("Message 4")).toBeTruthy();
    // The list stays beside the thread, with the open one marked.
    expect(screen.getByRole("link", { name: /user1/ }).getAttribute("aria-current")).toBe("page");

    router.history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({ tab: "activity", section: "messages" });
  });
});

describe("desktop New message", () => {
  const JUMA = "0x9b2E18f7329bb8b533E5Be0D8B176eE1ed735600";

  it("asks a user found by search to talk, then opens the new thread", async () => {
    mocks.search.mockImplementation((query: string | null) => ({
      data: query
        ? [
            { kind: "user", name: "juma", alias: "juma", address: JUMA, chainId: 0 },
            { kind: "pool", name: "Juma pool", alias: null, address: VIEWER, chainId: 0 },
          ]
        : undefined,
      isDebouncing: false,
      isFetching: false,
      isSuccess: Boolean(query),
    }));
    mocks.client.request.mockResolvedValue(
      conversation(40, { status: "pending", requestedBySelf: true }),
    );
    mocks.client.get.mockResolvedValue(
      conversation(40, { status: "pending", requestedBySelf: true }),
    );
    mocks.client.messages.mockResolvedValue({ items: [], hasMore: false });
    const { router } = mountDesk("/?tab=activity&section=messages");

    fireEvent.click(await screen.findByRole("button", { name: "New message" }));
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Username or phone number" }), {
      target: { value: "juma" },
    });
    const people = within(dialog).getByRole("list", { name: "Matching people" });
    // Only a person can be messaged, not a pool.
    expect(within(people).getAllByRole("button", { name: "Message" })).toHaveLength(1);
    fireEvent.click(within(people).getByRole("button", { name: "Message" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Introduce yourself" }), {
      target: { value: "We met at the market" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(mocks.client.request).toHaveBeenCalledWith({
        recipientAddress: JUMA,
        intro: "We met at the market",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/40"));
    expect(await screen.findByText("Waiting for them to accept your request.")).toBeTruthy();
  });

  it("opens the existing thread instead of a second request", async () => {
    mocks.client.list.mockResolvedValue({ items: [conversation(1)], nextCursor: null });
    mocks.client.get.mockResolvedValue(conversation(1));
    mocks.client.messages.mockResolvedValue({ items: [], hasMore: false });
    mocks.search.mockReturnValue({
      data: [{ kind: "user", name: "user1", alias: "user1", address: AMINA, chainId: 0 }],
      isDebouncing: false,
      isFetching: false,
      isSuccess: true,
    });
    const { router } = mountDesk("/?tab=activity&section=messages");
    await screen.findByRole("link", { name: /user1/ });
    fireEvent.click(screen.getByRole("button", { name: "New message" }));
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "user1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Message" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/1"));
    expect(mocks.client.request).not.toHaveBeenCalled();
  });
});

describe("desktop Helpdesk", () => {
  it("starts the conversation with Support when there is none", async () => {
    mocks.client.helpdesk.mockResolvedValue(
      conversation(11, { kind: "helpdesk", status: "open", peer: null }),
    );
    mocks.client.get.mockResolvedValue(
      conversation(11, { kind: "helpdesk", status: "open", peer: null }),
    );
    mocks.client.messages.mockResolvedValue({ items: [], hasMore: false });
    const { router } = mountDesk("/?tab=activity&section=helpdesk");

    fireEvent.click(await screen.findByRole("button", { name: "Contact support" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/11"));
    expect(await screen.findByText("Ask Support anything.")).toBeTruthy();
    expect(
      within(sections())
        .getByRole("link", { name: /^Helpdesk/ })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("opens the existing conversation in place", async () => {
    const helpdesk = conversation(11, { kind: "helpdesk", status: "open", peer: null });
    mocks.client.list.mockImplementation(({ kind }: { kind: string }) =>
      Promise.resolve({ items: kind === "helpdesk" ? [helpdesk] : [], nextCursor: null }),
    );
    mocks.client.get.mockResolvedValue(helpdesk);
    mocks.client.messages.mockResolvedValue({
      items: [message(30, 11, "self", "My voucher is stuck"), message(31, 11, "support", "On it")],
      hasMore: false,
    });
    mountDesk("/?tab=activity&section=helpdesk");

    expect(await screen.findByText("On it")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Support" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Contact support" })).toBeNull();
    // The support reply is on screen, so the marker moves to it.
    await waitFor(() => expect(mocks.client.markRead).toHaveBeenCalledWith(11, 31));
  });
});

describe("desktop Notifications", () => {
  it("lists the inbox without message kinds", async () => {
    mocks.inbox.mockResolvedValue([
      {
        notificationId: "n1",
        kind: "voucher.received",
        title: "Voucher received",
        body: "You received 5 KFP.",
        targetUrl: "/wallet",
        createdAt: "2026-11-09T10:00:00Z",
        receivedAt: "2026-11-09T10:00:00Z",
        priority: "high",
      },
      {
        notificationId: "n2",
        kind: "message.received",
        title: "New message",
        body: "amina sent you a message.",
        targetUrl: "/messages/5",
        createdAt: "2026-11-09T10:01:00Z",
        receivedAt: "2026-11-09T10:01:00Z",
        priority: "high",
      },
    ]);
    mountDesk("/?tab=activity&section=notifications");
    const list = await screen.findByRole("list", { name: "Notifications" });
    expect(within(list).getByText("Voucher received")).toBeTruthy();
    expect(screen.queryByText("New message")).toBeNull();
  });

  it("says when there is nothing yet", async () => {
    mountDesk("/?tab=activity&section=notifications");
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
  });
});
