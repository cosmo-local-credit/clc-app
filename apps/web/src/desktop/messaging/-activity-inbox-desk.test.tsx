import { BackendApiError } from "@clc/api/client/errors";
import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AdminHelpdeskItem, PostContactRequest } from "@clc/core/features/messaging/logic";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AMINA, conversation, message, mountDesk, VIEWER } from "./-messaging-desk-fixtures";

const mocks = vi.hoisted(() => ({
  enabled: { value: true },
  auth: {
    isAuthenticated: true,
    address: "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6",
    session: {
      address: "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6",
      role: "USER" as string,
    },
  },
  client: {
    unread: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    messages: vi.fn(),
    markRead: vi.fn(),
    helpdesk: vi.fn(),
    request: vi.fn(),
    resourceTargets: vi.fn(),
    postRequests: vi.fn(),
    requestPostContact: vi.fn(),
    setPostRequestStatus: vi.fn(),
  },
  admin: {
    counts: vi.fn(),
    helpdeskQueue: vi.fn(),
    helpdeskItem: vi.fn(),
    helpdeskMessages: vi.fn(),
    reply: vi.fn(),
    setHelpdeskStatus: vi.fn(),
  },
  getAccountActivity: vi.fn(),
  visit: vi.fn(),
  inbox: vi.fn(),
  search: vi.fn(),
  myPost: vi.fn(),
}));

vi.mock("#/lib/messaging-config", () => ({
  get MESSAGING_ENABLED() {
    return mocks.enabled.value;
  },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));
vi.mock("#/lib/api/messaging", () => ({
  messagingClient: mocks.client,
  adminMessagingClient: mocks.admin,
}));
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
vi.mock("#/features/home/hooks/use-reports", () => ({
  useReport: () => ({ data: { id: "47", title: "Harvest notes" } }),
}));
vi.mock("#/features/posts/hooks/use-my-posts", () => ({
  useMyPost: (id: string) =>
    useQuery({
      queryKey: ["test-my-post", mocks.auth.address, id],
      queryFn: mocks.myPost,
      retry: false,
    }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/features/notifications/storage/notification-db", () => ({
  isNotificationStorageAvailable: () => true,
  listNotificationInboxMessages: mocks.inbox,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.value = true;
  mocks.auth = {
    isAuthenticated: true,
    address: VIEWER,
    session: { address: VIEWER, role: "USER" },
  };
  mocks.client.unread.mockResolvedValue({ direct: 3, requests: 1, helpdesk: 2 });
  mocks.client.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.client.markRead.mockResolvedValue(undefined);
  mocks.client.postRequests.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mocks.client.requestPostContact.mockReset();
  mocks.client.resourceTargets.mockReset().mockResolvedValue({ targets: [] });
  mocks.client.setPostRequestStatus.mockReset();
  mocks.myPost.mockReset().mockRejectedValue(new BackendApiError(404, "not found"));
  mocks.getAccountActivity.mockResolvedValue({ activity: [], last: undefined });
  mocks.inbox.mockResolvedValue([]);
  mocks.search.mockReturnValue({ data: undefined, isDebouncing: false, isFetching: false });
  mocks.admin.counts.mockResolvedValue({ helpdeskNeedsReply: 0, abuseReportsOpen: 0 });
  mocks.admin.helpdeskQueue.mockResolvedValue({ items: [], nextCursor: null });
  mocks.admin.helpdeskItem.mockRejectedValue(new Error("Unexpected Helpdesk item read"));
  mocks.admin.helpdeskMessages.mockRejectedValue(new Error("Unexpected Helpdesk message read"));
  mocks.admin.reply.mockRejectedValue(new Error("Unexpected Helpdesk reply"));
  mocks.admin.setHelpdeskStatus.mockRejectedValue(new Error("Unexpected Helpdesk status write"));
});

function sections() {
  return screen.getByRole("navigation", { name: "Activity sections" });
}

function adminHelpdeskItem(id: number, body: string | null = null): AdminHelpdeskItem {
  return {
    id,
    status: "open" as const,
    user: { address: AMINA, username: `admin-user-${id}`, avatar: null },
    lastMessage: body
      ? {
          id: id + 100,
          conversationId: id,
          clientId: `00000000-0000-4000-8000-${id.toString().padStart(12, "0")}`,
          sender: "user" as const,
          adminAddress: null,
          body,
          imageUrls: [],
          createdAt: "2026-11-09T10:00:00Z",
        }
      : null,
    lastMessageAt: "2026-11-09T10:00:00Z",
    needsReply: true,
    createdAt: "2026-11-09T09:00:00Z",
    updatedAt: "2026-11-09T10:00:00Z",
  };
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
  it("shows the self-only contact notice for a resource on desktop", async () => {
    mocks.client.resourceTargets.mockResolvedValue({ targets: [], selfOnly: true });
    mountDesk("/?tab=activity&section=messages&messageKind=want&messageResource=42");
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "You can't message yourself.",
    );
    expect(within(dialog).queryByText("No message recipient is available.")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Send request" })).toBeNull();
    expect(mocks.client.request).not.toHaveBeenCalled();
  });

  it("prevents an author requesting contact through their own Post on desktop", async () => {
    mocks.myPost.mockResolvedValue({ id: "47" });
    mountDesk("/?tab=activity&section=messages&messageKind=post&messageResource=47");
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "You can't message yourself.",
    );
    expect(within(dialog).queryByRole("button", { name: "Send request" })).toBeNull();
    expect(mocks.client.requestPostContact).not.toHaveBeenCalled();
  });
  it("opens a Post contact request directly and clears its intent when closed", async () => {
    mocks.client.requestPostContact.mockResolvedValue({
      id: "d70ea7f3-1a11-4460-8da8-4275ba25a32a",
      postId: "47",
      postTitle: "Harvest notes",
      direction: "outgoing",
      status: "pending",
      intro: null,
      conversationId: null,
      requester: null,
      createdAt: "2026-11-09T09:00:00Z",
    });
    const { router } = mountDesk(
      "/?tab=activity&section=messages&messageKind=post&messageResource=47",
    );
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    expect(within(dialog).getByRole("link", { name: "Post: Harvest notes" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect((await within(dialog).findByRole("status")).textContent).toContain(
      "The author can open a conversation",
    );
    expect(mocks.client.requestPostContact).toHaveBeenCalledWith({
      postId: "47",
      intro: undefined,
    });
    expect(mocks.client.resourceTargets).not.toHaveBeenCalled();
    expect(mocks.client.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ peerAddress: expect.anything() }),
      expect.anything(),
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("messageKind"));
  });

  it("lists Post requests, accepts an incoming request, and links the accepted conversation", async () => {
    const incoming: PostContactRequest = {
      id: "d70ea7f3-1a11-4460-8da8-4275ba25a32a",
      postId: "47",
      postTitle: "Harvest notes",
      direction: "incoming",
      status: "pending",
      intro: "Can I join the next harvest?",
      conversationId: null,
      requester: { address: AMINA, username: "amina", avatar: null },
      createdAt: "2026-11-09T09:00:00Z",
    };
    const outgoing: PostContactRequest = {
      ...incoming,
      id: "b7f2b272-a2f1-46a2-bd53-e9d0ce060d45",
      postId: "48",
      postTitle: "Garden notes",
      direction: "outgoing",
      intro: null,
      requester: null,
    };
    const accepted = { ...incoming, status: "accepted", conversationId: 40 } as const;
    const closed: PostContactRequest = {
      ...accepted,
      id: "3dd38c80-bf28-4bef-a032-77ef6fbe432c",
      postId: "49",
      postTitle: "Closed request",
      conversationId: null,
      intro: null,
    };
    mocks.client.unread.mockResolvedValue({ direct: 3, requests: 1, helpdesk: 2, postRequests: 1 });
    mocks.client.postRequests
      .mockResolvedValueOnce({ items: [incoming, outgoing, closed], nextCursor: null })
      .mockResolvedValue({ items: [accepted, outgoing, closed], nextCursor: null });
    mocks.client.setPostRequestStatus.mockResolvedValue(accepted);
    mountDesk("/?tab=activity&section=messages");

    const heading = await screen.findByRole("heading", { name: "Post requests" });
    const requests = within(heading.closest("section")!);
    expect(requests.getByRole("link", { name: "Post: Harvest notes" }).getAttribute("href")).toBe(
      "/posts/47",
    );
    expect(requests.getByText("Can I join the next harvest?")).toBeTruthy();
    expect(requests.getByText("Pending")).toBeTruthy();
    expect(requests.getByText("Closed")).toBeTruthy();
    expect(requests.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
    expect(await screen.findByRole("link", { name: "Messages, 5 new" })).toBeTruthy();
    fireEvent.click(requests.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(mocks.client.setPostRequestStatus).toHaveBeenCalledWith(incoming.id, "accepted"),
    );
    expect(
      (await requests.findByRole("link", { name: "Open conversation" })).getAttribute("href"),
    ).toBe("/messages/40");
  });

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

  it("opens from a resource ID alone, retries lookup, and sends with the original context", async () => {
    mocks.client.resourceTargets
      .mockRejectedValueOnce(new Error("owner service unavailable"))
      .mockResolvedValue({ targets: [{ address: JUMA, username: "juma", avatar: null }] });
    const newThread = conversation(40, { status: "pending", requestedBySelf: true });
    mocks.client.request.mockResolvedValue(newThread);
    mocks.client.get.mockResolvedValue(newThread);
    mocks.client.messages.mockResolvedValue({ items: [], hasMore: false });
    const { router } = mountDesk(
      "/?tab=activity&section=messages&messageKind=catalog&messageResource=47",
    );

    const dialog = within(await screen.findByRole("dialog", { name: "New message" }));
    expect(await dialog.findByText("Couldn't load recipients.")).toBeTruthy();
    expect(router.state.location.search.messageResource).toBe("47");
    fireEvent.click(dialog.getByRole("button", { name: "Retry" }));
    const intro = await dialog.findByRole("textbox", { name: "Introduce yourself" });
    expect(dialog.queryByRole("searchbox")).toBeNull();
    expect(router.state.location.search.messageResource).toBe("47");
    fireEvent.change(intro, { target: { value: "A question about your catalog" } });
    fireEvent.click(dialog.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/40"));
    expect(mocks.client.resourceTargets).toHaveBeenCalledTimes(2);
    expect(mocks.client.request).toHaveBeenCalledWith({
      recipientAddress: JUMA,
      intro: "A question about your catalog",
      context: { kind: "catalog", resourceId: "47" },
    });
  });

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
    fireEvent.change(
      within(dialog).getByRole("searchbox", { name: "Username, address, or phone number" }),
      {
        target: { value: "juma" },
      },
    );
    const people = within(dialog).getByRole("list", { name: "Matching people" });
    // Only a person can be messaged, not a pool.
    expect(within(people).getAllByRole("button", { name: "Message" })).toHaveLength(1);
    fireEvent.click(within(people).getByRole("button", { name: "Message" }));
    fireEvent.change(await within(dialog).findByRole("textbox", { name: "Introduce yourself" }), {
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

  it("opens an older accepted thread outside the loaded inbox page", async () => {
    mocks.client.list.mockImplementation(({ peerAddress }) =>
      Promise.resolve(
        peerAddress
          ? { items: [conversation(1)], nextCursor: null }
          : { items: [], nextCursor: "older" },
      ),
    );
    mocks.client.get.mockResolvedValue(conversation(1));
    mocks.client.messages.mockResolvedValue({ items: [], hasMore: false });
    mocks.search.mockReturnValue({
      data: [{ kind: "user", name: "user1", alias: "user1", address: AMINA, chainId: 0 }],
      isDebouncing: false,
      isFetching: false,
      isSuccess: true,
    });
    const { router } = mountDesk("/?tab=activity&section=messages");
    fireEvent.click(await screen.findByRole("button", { name: "New message" }));
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

  it("shows the operator queue instead of Contact support to a Superadmin", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "SUPERADMIN" },
    };
    mocks.admin.counts.mockResolvedValue({ helpdeskNeedsReply: 1, abuseReportsOpen: 0 });
    mocks.admin.helpdeskQueue.mockResolvedValue({
      items: [
        {
          id: 21,
          status: "open",
          user: { address: AMINA, username: "amina", avatar: null },
          lastMessage: {
            id: 31,
            conversationId: 21,
            clientId: "00000000-0000-4000-8000-000000000031",
            sender: "user",
            adminAddress: null,
            body: "Please help with my voucher",
            imageUrls: [],
            createdAt: "2026-11-09T10:00:00Z",
          },
          lastMessageAt: "2026-11-09T10:00:00Z",
          needsReply: true,
          createdAt: "2026-11-09T09:00:00Z",
          updatedAt: "2026-11-09T10:00:00Z",
        },
      ],
      nextCursor: null,
    });

    mountDesk("/?tab=activity&section=helpdesk", true);

    expect(await screen.findByText("amina")).toBeTruthy();
    expect(screen.getByText("Please help with my voucher")).toBeTruthy();
    expect(screen.getByText("Needs reply")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Contact support" })).toBeNull();
    expect(screen.getByText("No helpdesk conversation open")).toBeTruthy();
  });

  it("lets a Superadmin reply to and resolve a Helpdesk conversation in place", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "SUPERADMIN" },
    };
    const item = {
      id: 21,
      status: "open" as const,
      user: { address: AMINA, username: "amina", avatar: null },
      lastMessage: null,
      lastMessageAt: "2026-11-09T10:00:00Z",
      needsReply: true,
      createdAt: "2026-11-09T09:00:00Z",
      updatedAt: "2026-11-09T10:00:00Z",
    };
    mocks.admin.helpdeskItem.mockResolvedValue(item);
    mocks.admin.helpdeskMessages.mockResolvedValue({
      items: [
        {
          id: 31,
          conversationId: 21,
          clientId: "00000000-0000-4000-8000-000000000031",
          sender: "user",
          adminAddress: null,
          body: "Please help with my voucher",
          imageUrls: [],
          createdAt: "2026-11-09T10:00:00Z",
        },
      ],
      hasMore: false,
    });
    mocks.admin.reply.mockResolvedValue({
      id: 32,
      conversationId: 21,
      clientId: "00000000-0000-4000-8000-000000000032",
      sender: "support",
      adminAddress: VIEWER,
      body: "I can help",
      imageUrls: [],
      createdAt: "2026-11-09T10:01:00Z",
    });
    mocks.admin.setHelpdeskStatus.mockResolvedValue({
      ...item,
      status: "resolved",
      needsReply: false,
    });

    mountDesk("/?tab=activity&section=helpdesk&helpdeskId=21", true);

    expect(await screen.findByText("Please help with my voucher")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Write a reply"), {
      target: { value: "I can help" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() =>
      expect(mocks.admin.reply).toHaveBeenCalledWith(21, {
        clientId: expect.any(String),
        body: "I can help",
      }),
    );
    expect(await screen.findByText("I can help")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(mocks.admin.setHelpdeskStatus).toHaveBeenCalledWith(21, "resolved"));
  });

  it("lets an operator reopen a resolved Helpdesk conversation", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
    };
    const resolved = {
      ...adminHelpdeskItem(21),
      status: "resolved" as const,
      needsReply: false,
    };
    mocks.admin.helpdeskItem.mockResolvedValue(resolved);
    mocks.admin.helpdeskMessages.mockResolvedValue({ items: [], hasMore: false });
    mocks.admin.setHelpdeskStatus.mockRejectedValue(new Error("refused"));

    mountDesk("/?tab=activity&section=helpdesk&helpdeskStatus=resolved&helpdeskId=21", true);

    expect(await screen.findByRole("heading", { name: "admin-user-21" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(mocks.admin.setHelpdeskStatus).toHaveBeenCalledWith(21, "open"));
    expect(await screen.findByText("That didn't work. Try again.")).toBeTruthy();
  });

  it.each([
    ["open", "No open helpdesk conversations."],
    ["resolved", "No resolved helpdesk conversations."],
  ] as const)("shows the empty %s operator queue", async (status, message) => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
    };
    mountDesk(
      `/?tab=activity&section=helpdesk${status === "resolved" ? "&helpdeskStatus=resolved" : ""}`,
      true,
    );
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("renders resolved operator rows with photo and empty previews", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
    };
    const photo = adminHelpdeskItem(22);
    photo.status = "resolved";
    photo.needsReply = false;
    photo.lastMessage = {
      id: 122,
      conversationId: 22,
      clientId: "00000000-0000-4000-8000-000000000022",
      sender: "user",
      adminAddress: null,
      body: null,
      imageUrls: ["https://storage.example/photo.jpg"],
      createdAt: "2026-11-09T10:00:00Z",
    };
    const empty = { ...adminHelpdeskItem(23), status: "resolved" as const, needsReply: false };
    empty.lastMessageAt = null;
    mocks.admin.helpdeskQueue.mockResolvedValue({ items: [photo, empty], nextCursor: null });

    mountDesk("/?tab=activity&section=helpdesk&helpdeskStatus=resolved", true);

    expect(await screen.findByText("Photo")).toBeTruthy();
    expect(screen.getByText("No messages")).toBeTruthy();
    expect(screen.queryByText("Needs reply")).toBeNull();
  });

  it("recovers and paginates the operator queue", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
    };
    mocks.admin.helpdeskQueue.mockRejectedValueOnce(new Error("down"));
    mountDesk("/?tab=activity&section=helpdesk", true);
    expect(await screen.findByText("Couldn't load the helpdesk.")).toBeTruthy();

    mocks.admin.helpdeskQueue
      .mockResolvedValueOnce({ items: [adminHelpdeskItem(21, "First page")], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [adminHelpdeskItem(22, "Second page")], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("First page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second page")).toBeTruthy();
  });

  it("recovers the selected thread and loads earlier messages", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "SUPERADMIN" },
    };
    mocks.admin.helpdeskItem.mockRejectedValueOnce(new Error("down"));
    mocks.admin.helpdeskMessages.mockResolvedValue({ items: [], hasMore: false });
    mountDesk("/?tab=activity&section=helpdesk&helpdeskId=21", true);
    expect(await screen.findByText("Couldn't load this conversation.")).toBeTruthy();

    mocks.admin.helpdeskItem.mockResolvedValue(adminHelpdeskItem(21));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "admin-user-21" })).toBeTruthy();
  });

  it("retries failed operator messages and loads an earlier page", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "SUPERADMIN" },
    };
    mocks.admin.helpdeskItem.mockResolvedValue(adminHelpdeskItem(21));
    mocks.admin.helpdeskMessages.mockRejectedValueOnce(new Error("down"));
    mocks.admin.helpdeskMessages
      .mockResolvedValueOnce({
        items: [
          {
            ...adminHelpdeskItem(21, "Newest").lastMessage!,
            id: 31,
            conversationId: 21,
          },
        ],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...adminHelpdeskItem(21, "Older").lastMessage!,
            id: 30,
            conversationId: 21,
          },
        ],
        hasMore: false,
      });
    mountDesk("/?tab=activity&section=helpdesk&helpdeskId=21", true);
    expect(await screen.findByText("Couldn't load messages.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Newest")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(await screen.findByText("Older")).toBeTruthy();
  });
});

describe("desktop Notifications", () => {
  it("lists approval notifications without transaction or message kinds", async () => {
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
        notificationId: "n3",
        kind: "safe.approved",
        title: "Safe action approved",
        body: "amina signed a Safe action.",
        targetUrl: `/?tab=activity&section=notifications&safe=${AMINA}&safeTx=0x${"a".repeat(64)}`,
        createdAt: "2026-11-09T10:02:00Z",
        receivedAt: "2026-11-09T10:02:00Z",
        priority: "high",
        actorAddress: AMINA,
        actorUsername: "amina",
        resources: [{ kind: "pool", address: VIEWER, name: "Community Pool" }],
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
    expect(within(list).getByText("Safe action approved")).toBeTruthy();
    expect(within(list).getByRole("link", { name: "amina" })).toBeTruthy();
    expect(within(list).getByRole("link", { name: "Community Pool" })).toBeTruthy();
    expect(screen.queryByText("Voucher received")).toBeNull();
    expect(screen.queryByText("New message")).toBeNull();
  });

  it("says when there is nothing yet", async () => {
    mountDesk("/?tab=activity&section=notifications");
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
  });
});
