import { BackendApiError } from "@clc/api/client/errors";
import type {
  AdminHelpdeskItem,
  Conversation,
  PostContactRequest,
} from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  parseActivityHelpdeskId,
  parseActivityHelpdeskStatus,
  parseActivityMessageContext,
  parseActivityMessageTo,
  parseActivityPostContact,
  parseActivitySection,
} from "#/lib/navigation/activity-search";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";
const AMINA = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const JUMA = "0x9b2E18f7329bb8b533E5Be0D8B176eE1ed735600";

const mocks = vi.hoisted(() => ({
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
  search: vi.fn(),
  inbox: vi.fn(),
  owner: vi.fn(),
  report: vi.fn(),
}));

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));
vi.mock("#/lib/api/messaging", () => ({
  messagingClient: mocks.client,
  adminMessagingClient: mocks.admin,
}));
vi.mock("#/lib/api/safe", () => ({ safeClient: { owner: mocks.owner } }));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("#/features/home/hooks/use-reports", () => ({
  useReport: (id: string) =>
    useQuery({ queryKey: ["test-post", id], queryFn: mocks.report, retry: false }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));
vi.mock("#/features/wallet/hooks/use-activity-unseen", () => ({
  useActivityUnseen: () => ({ count: 2 }),
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useRecipientSearch: (query: string | null) => mocks.search(query),
}));
vi.mock("#/features/notifications/storage/notification-db", () => ({
  isNotificationStorageAvailable: () => true,
  listNotificationInboxMessages: mocks.inbox,
}));
vi.mock("./activity-page", () => ({
  ActivityPage: ({ sections }: { sections?: ReactNode }) => (
    <div>
      {sections}
      <p>Transactions feed</p>
    </div>
  ),
}));

import { ActivityInbox } from "./activity-inbox";

function conversation(id: number, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    kind: "direct",
    status: "accepted",
    peer: { address: AMINA, username: `user${id}`, avatar: null },
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

function mountAt(entry: string) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
      tab: typeof search.tab === "string" ? search.tab : undefined,
      section: typeof search.section === "string" ? search.section : undefined,
      messageTo: typeof search.messageTo === "string" ? search.messageTo : undefined,
      messageKind: search.messageKind,
      messageResource: search.messageResource,
      messageVoucher: search.messageVoucher,
      helpdeskId:
        typeof search.helpdeskId === "string" || typeof search.helpdeskId === "number"
          ? search.helpdeskId
          : undefined,
      helpdeskStatus: typeof search.helpdeskStatus === "string" ? search.helpdeskStatus : undefined,
    }),
    component: function Home() {
      const search = home.useSearch() as unknown as {
        section?: string;
        messageTo?: string;
        messageKind?: string;
        messageResource?: string | number;
        messageVoucher?: string;
        helpdeskId?: string | number;
        helpdeskStatus?: string;
      };
      const postId = parseActivityPostContact(search);
      const navigate = home.useNavigate();
      return (
        <ActivityInbox
          section={parseActivitySection(search.section)}
          operator={
            mocks.auth.session?.role === "ADMIN" || mocks.auth.session?.role === "SUPERADMIN"
          }
          messageTo={parseActivityMessageTo(search.messageTo)}
          messageContext={
            postId ? { kind: "post", resourceId: postId } : parseActivityMessageContext(search)
          }
          helpdeskId={parseActivityHelpdeskId(search.helpdeskId)}
          helpdeskStatus={parseActivityHelpdeskStatus(search.helpdeskStatus)}
          onMessageToConsumed={() =>
            void navigate({
              search: (previous) => ({
                ...previous,
                messageTo: undefined,
                messageKind: undefined,
                messageResource: undefined,
                messageVoucher: undefined,
              }),
              replace: true,
            })
          }
        />
      );
    },
  });
  const thread = createRoute({
    getParentRoute: () => root,
    path: "messages/$conversationId",
    component: () => <p>Thread page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      home,
      thread,
      createRoute({
        getParentRoute: () => root,
        path: "posts/$reportId",
        component: () => <p>Post page</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = {
    isAuthenticated: true,
    address: VIEWER,
    session: { address: VIEWER, role: "USER" },
  };
  mocks.client.unread.mockResolvedValue({ direct: 3, requests: 1, helpdesk: 2 });
  mocks.client.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.client.postRequests.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mocks.client.requestPostContact.mockReset();
  mocks.client.setPostRequestStatus.mockReset();
  mocks.report.mockReset().mockResolvedValue({ id: "42", title: "Community garden" });
  mocks.client.resourceTargets.mockResolvedValue({
    targets: [{ address: AMINA, username: "amina", avatar: null }],
  });
  mocks.search.mockReturnValue({ data: undefined, isDebouncing: false, isFetching: false });
  mocks.inbox.mockResolvedValue([]);
  mocks.owner.mockResolvedValue({
    kind: "eoa",
    owner: AMINA,
    messageTargets: [{ address: AMINA, username: "amina", avatar: null }],
  });
  mocks.admin.counts.mockResolvedValue({ helpdeskNeedsReply: 0, abuseReportsOpen: 0 });
  mocks.admin.helpdeskQueue.mockResolvedValue({ items: [], nextCursor: null });
  mocks.admin.helpdeskItem.mockRejectedValue(new Error("Unexpected Helpdesk item read"));
  mocks.admin.helpdeskMessages.mockRejectedValue(new Error("Unexpected Helpdesk message read"));
  mocks.admin.reply.mockRejectedValue(new Error("Unexpected Helpdesk reply"));
  mocks.admin.setHelpdeskStatus.mockRejectedValue(new Error("Unexpected Helpdesk status write"));
});

describe("Activity sub-tabs", () => {
  it("shows each sub-tab's count and keeps the feed on Transactions", async () => {
    mountAt("/?tab=activity");
    expect(await screen.findByText("Transactions feed")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Activity sections" });
    await waitFor(() =>
      expect(within(nav).getByRole("link", { name: "Messages, 4 new" })).toBeTruthy(),
    );
    expect(within(nav).getByRole("link", { name: "Transactions, 2 new" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Helpdesk, 2 new" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Notifications" })).toBeTruthy();
  });

  it("switches sub-tabs through history, and the selected one does nothing", async () => {
    const { router } = mountAt("/?tab=activity");
    fireEvent.click(await screen.findByRole("link", { name: /^Messages/ }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "activity", section: "messages" }),
    );
    expect(screen.queryByText("Transactions feed")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /^Messages/ }));
    expect(router.history.length).toBe(2);

    act(() => router.history.back());
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "activity" }));
    expect(await screen.findByText("Transactions feed")).toBeTruthy();
  });
});

describe("Messages section", () => {
  it("keeps private request and inbox reads disabled for a guest", async () => {
    mocks.auth.isAuthenticated = false;
    mountAt("/?tab=activity&section=messages");
    await screen.findByRole("button", { name: "New message" });
    expect(mocks.client.postRequests).not.toHaveBeenCalled();
    expect(mocks.client.list).not.toHaveBeenCalled();
  });
  it.each([
    ["Searching…", { isDebouncing: true, isFetching: false }],
    [
      "Couldn't search. Try again.",
      { isDebouncing: false, isFetching: false, error: new Error("offline") },
    ],
    ["No matching people.", { isDebouncing: false, isFetching: false, isSuccess: true, data: [] }],
  ])("shows recipient-search feedback for %s", async (message, search) => {
    mocks.search.mockReturnValue(search);
    mountAt("/?tab=activity&section=messages");
    fireEvent.click(await screen.findByRole("button", { name: "New message" }));
    fireEvent.change(await screen.findByPlaceholderText("Username, address, or phone number"), {
      target: { value: "amina" },
    });
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("keeps an unavailable resource's composer open without offering a send", async () => {
    mocks.client.resourceTargets.mockResolvedValue({ targets: [] });
    mountAt("/?tab=activity&section=messages&messageKind=want&messageResource=42");
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(await within(sheet).findByText("No message recipient is available.")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Send request" })).toBeNull();
    expect(mocks.client.request).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "want", resourceId: "42" },
    { kind: "pool", resourceId: "0x2222222222222222222222222222222222222222" },
  ])("preserves $kind context when opening an accepted conversation", async (context) => {
    mocks.client.list.mockImplementation(async (params: { peerAddress?: string }) => ({
      items: params.peerAddress ? [conversation(12)] : [],
      nextCursor: null,
    }));
    const { router } = mountAt(
      `/?tab=activity&section=messages&messageKind=${context.kind}&messageResource=${context.resourceId}`,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/12"));
    expect(router.state.location.search).toMatchObject({
      messageKind: context.kind,
      messageResource: context.resourceId,
    });
    expect(mocks.client.request).not.toHaveBeenCalled();
  });

  it("clears a single-recipient resource intent when Back is pressed", async () => {
    const { router } = mountAt(
      "/?tab=activity&section=messages&messageKind=want&messageResource=42",
    );
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("messageKind"));
    expect(screen.queryByRole("dialog", { name: "New message" })).toBeNull();
    expect(mocks.client.request).not.toHaveBeenCalled();
  });

  it("shows its loading state while the list is pending", async () => {
    mocks.client.list.mockReturnValue(new Promise(() => {}));
    mountAt("/?tab=activity&section=messages");
    expect(await screen.findByText("Loading messages…")).toBeTruthy();
  });

  it("shows an empty inbox", async () => {
    mountAt("/?tab=activity&section=messages");
    expect(await screen.findByText("No messages yet.")).toBeTruthy();
    expect(mocks.client.list).toHaveBeenCalledWith(
      { kind: "direct", cursor: undefined },
      expect.anything(),
    );
  });

  it("offers a retry when the list fails, then lists requests first", async () => {
    // A refusal, so the transient-read retry does not hold the error back.
    mocks.client.list.mockRejectedValueOnce(new BackendApiError(400, "refused"));
    mountAt("/?tab=activity&section=messages");
    expect(await screen.findByText("Couldn't load messages.")).toBeTruthy();
    mocks.client.list.mockResolvedValue({
      items: [conversation(1), conversation(2, { status: "pending", canAccept: true })],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const requests = await screen.findByRole("region", { name: "Message requests" });
    expect(within(requests).getByText("user2")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Conversations" })).getByText("user1"),
    ).toBeTruthy();
  });

  it("keeps the list it has when a later poll fails", async () => {
    mocks.client.list.mockResolvedValueOnce({ items: [conversation(1)], nextCursor: null });
    const { client } = mountAt("/?tab=activity&section=messages");
    expect(await screen.findByText("user1")).toBeTruthy();
    mocks.client.list.mockRejectedValue(new BackendApiError(503, "unavailable"));
    await act(() => client.refetchQueries({ type: "active" }).catch(() => undefined));
    expect(screen.getByText("user1")).toBeTruthy();
    expect(screen.queryByText("Couldn't load messages.")).toBeNull();
  });

  it("messages a user found by recipient search and opens the new thread", async () => {
    mocks.search.mockImplementation((query: string | null) => ({
      data: query
        ? [
            { kind: "user", name: "amina", alias: "amina", address: AMINA, chainId: 0 },
            {
              kind: "pool",
              name: "Pool",
              alias: "pool",
              address: "0x00000000000000000000000000000000000000aa",
              chainId: 0,
            },
          ]
        : undefined,
      isDebouncing: false,
      isFetching: false,
      isSuccess: Boolean(query),
    }));
    mocks.client.request.mockResolvedValue(
      conversation(7, { status: "pending", requestedBySelf: true }),
    );
    const { router } = mountAt("/?tab=activity&section=messages");
    fireEvent.click(await screen.findByRole("button", { name: "New message" }));
    fireEvent.change(await screen.findByPlaceholderText("Username, address, or phone number"), {
      target: { value: "amina" },
    });
    const results = await screen.findByRole("list", { name: "Matching people" });
    expect(within(results).getAllByRole("button", { name: "Message" })).toHaveLength(1);
    fireEvent.click(within(results).getByRole("button", { name: "Message" }));
    fireEvent.change(await screen.findByLabelText("Introduce yourself"), {
      target: { value: "Hello from the market" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/7"));
    expect(mocks.client.request).toHaveBeenCalledWith({
      recipientAddress: AMINA,
      intro: "Hello from the market",
    });
  });

  it("opens from a resource contact, prefills its eligible owner, and clears the URL seed", async () => {
    mocks.client.request.mockResolvedValue(
      conversation(8, { status: "pending", requestedBySelf: true }),
    );
    const { router } = mountAt(
      `/?tab=activity&section=messages&messageTo=${encodeURIComponent(AMINA)}`,
    );
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(await within(sheet).findByText("amina")).toBeTruthy();
    expect(router.state.location.search).toHaveProperty("messageTo", AMINA);
    fireEvent.click(within(sheet).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/8"));
    expect(mocks.client.request).toHaveBeenCalledWith({ recipientAddress: AMINA });
  });

  it("retries a failed resource-owner lookup", async () => {
    mocks.owner.mockRejectedValueOnce(new Error("offline"));
    mountAt(`/?tab=activity&section=messages&messageTo=${encodeURIComponent(AMINA)}`);

    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(within(sheet).getByText("Couldn't load recipients.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Retry" }));

    expect(await within(sheet).findByText("amina")).toBeTruthy();
    expect(mocks.owner).toHaveBeenCalledTimes(2);
  });

  it("lets the viewer choose an eligible signer when a resource owner is a Safe", async () => {
    mocks.owner.mockResolvedValue({
      kind: "safe",
      owner: AMINA,
      signers: [AMINA, JUMA],
      threshold: 2,
      messageTargets: [
        { address: AMINA, username: "amina", avatar: null },
        { address: JUMA, username: "juma", avatar: null },
      ],
    });
    const { router } = mountAt(
      `/?tab=activity&section=messages&messageTo=${encodeURIComponent(AMINA)}`,
    );
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(within(sheet).getByText("Choose who to message.")).toBeTruthy();
    expect(within(sheet).getAllByRole("button", { name: "Message" })).toHaveLength(2);
    fireEvent.click(within(sheet).getAllByRole("button", { name: "Message" })[1]!);
    expect(await within(sheet).findByText("juma")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Back" }));
    expect(await within(sheet).findByText("Choose who to message.")).toBeTruthy();
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "activity", section: "messages" }),
    );
  });

  it("opens the resource-only intent after a failed lookup and preserves context through Retry", async () => {
    mocks.client.resourceTargets.mockRejectedValueOnce(new Error("offline"));
    mocks.client.request.mockResolvedValue(conversation(9, { status: "pending" }));
    const { router } = mountAt(
      "/?tab=activity&section=messages&messageKind=want&messageResource=42",
    );
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(await within(sheet).findByText("Couldn't load recipients.")).toBeTruthy();
    expect(router.state.location.search).toHaveProperty("messageKind", "want");
    expect(mocks.owner).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole("button", { name: "Retry" }));
    fireEvent.click(await within(sheet).findByRole("button", { name: "Send request" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/9"));
    expect(mocks.client.request).toHaveBeenCalledWith({
      recipientAddress: AMINA,
      context: { kind: "want", resourceId: "42" },
    });
  });

  it("submits a Post request by ID without resolving a peer and opens the conversation only after acceptance", async () => {
    const postRequest = {
      id: "00000000-0000-4000-8000-000000000042",
      postId: "42",
      postTitle: "Community garden",
      direction: "outgoing",
      status: "pending",
      requester: null,
      intro: "Can I learn more?",
      conversationId: null,
      createdAt: "2026-11-09T09:00:00Z",
    };
    mocks.client.requestPostContact.mockImplementation(async () => {
      mocks.client.postRequests.mockResolvedValue({ items: [postRequest], nextCursor: null });
      return postRequest;
    });
    const { router, client } = mountAt(
      "/?tab=activity&section=messages&messageKind=post&messageResource=42",
    );
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(within(sheet).getByRole("link", { name: "Post: Community garden" })).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText("Introduce yourself"), {
      target: { value: postRequest.intro },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Send request" }));
    expect((await within(sheet).findByRole("status")).textContent).toContain(
      "The author can open a conversation",
    );
    expect(mocks.client.requestPostContact).toHaveBeenCalledWith({
      postId: "42",
      intro: postRequest.intro,
    });
    expect(mocks.client.resourceTargets).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.client.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ peerAddress: expect.anything() }),
      expect.anything(),
    );
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(await screen.findByText("Pending")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open conversation" })).toBeNull();
    mocks.client.postRequests.mockResolvedValue({
      items: [{ ...postRequest, status: "accepted", conversationId: 7 }],
      nextCursor: null,
    });
    await act(() =>
      client.refetchQueries({
        queryKey: ["clc", "messaging", VIEWER.toLowerCase(), "post-requests"],
      }),
    );
    fireEvent.click(await screen.findByRole("link", { name: "Open conversation" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/7"));
  });

  it("rejects an exact-address search for the current account before creating a request", async () => {
    mocks.search.mockReturnValue({
      data: [{ kind: "user", name: VIEWER, alias: VIEWER, address: VIEWER, chainId: 0 }],
      isDebouncing: false,
      isFetching: false,
      isSuccess: true,
    });
    mountAt("/?tab=activity&section=messages");
    fireEvent.click(await screen.findByRole("button", { name: "New message" }));
    fireEvent.change(await screen.findByPlaceholderText("Username, address, or phone number"), {
      target: { value: VIEWER },
    });
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(await screen.findByText("You can't message yourself.")).toBeTruthy();
    expect(mocks.client.request).not.toHaveBeenCalled();
  });
});

describe("Post contact recovery", () => {
  const pending: PostContactRequest = {
    id: "00000000-0000-4000-8000-000000000042",
    postId: "42",
    postTitle: "Community garden",
    direction: "outgoing",
    status: "pending",
    requester: null,
    intro: null,
    conversationId: null,
    createdAt: "2026-11-09T09:00:00Z",
  };

  it("shows a missing Post without offering a contact request", async () => {
    mocks.report.mockResolvedValue(null);
    mountAt("/?tab=activity&section=messages&messageKind=post&messageResource=42");
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(await within(sheet).findByText("Post not found.")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Send request" })).toBeNull();
    expect(mocks.client.requestPostContact).not.toHaveBeenCalled();
  });

  it("prevents repeated submits while a Post request is pending", async () => {
    let finish: (item: PostContactRequest) => void = () => {};
    mocks.client.requestPostContact.mockImplementation(
      () =>
        new Promise<PostContactRequest>((resolve) => {
          finish = resolve;
        }),
    );
    mountAt("/?tab=activity&section=messages&messageKind=post&messageResource=42");
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    const send = await within(sheet).findByRole("button", { name: "Send request" });
    fireEvent.click(send);
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(true));
    fireEvent.submit(send.closest("form")!);
    expect(mocks.client.requestPostContact).toHaveBeenCalledOnce();
    await act(async () => finish(pending));
    expect((await within(sheet).findByRole("status")).textContent).toContain(
      "The author can open a conversation",
    );
  });

  it.each([
    ["accepted", 7, "Open conversation"],
    ["accepted", null, "Closed"],
    ["declined", null, "Declined"],
  ] as const)("handles an existing %s request with conversation %s", async (status, id, label) => {
    mocks.client.requestPostContact.mockResolvedValue({
      ...pending,
      status,
      conversationId: id,
    });
    const { router } = mountAt(
      "/?tab=activity&section=messages&messageKind=post&messageResource=42",
    );
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Send request" }));
    expect(await within(sheet).findByText(label)).toBeTruthy();
    expect(mocks.client.requestPostContact).toHaveBeenCalledWith({
      postId: "42",
      intro: undefined,
    });
    expect(within(sheet).queryByRole("button", { name: "Send request" })).toBeNull();
    if (id !== null) {
      fireEvent.click(within(sheet).getByRole("button", { name: "Open conversation" }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/messages/7"));
      expect(router.state.location.search).not.toHaveProperty("messageKind");
    }
  });

  it.each([
    [
      new BackendApiError(429, "Too many requests"),
      "You've sent too many requests today. Try again tomorrow.",
    ],
    [new Error("offline"), "Couldn't send the request. Try again."],
  ])("keeps the introduction through a failed send and manual retry", async (error, message) => {
    mocks.client.requestPostContact.mockRejectedValueOnce(error).mockResolvedValue(pending);
    mountAt("/?tab=activity&section=messages&messageKind=post&messageResource=42");
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    const intro = await within(sheet).findByLabelText("Introduce yourself");
    fireEvent.change(intro, { target: { value: "  May I visit?  " } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Send request" }));
    expect((await within(sheet).findByRole("alert")).textContent).toContain(message);
    expect((intro as HTMLTextAreaElement).value).toBe("  May I visit?  ");
    fireEvent.click(within(sheet).getByRole("button", { name: "Send request" }));
    expect((await within(sheet).findByRole("status")).textContent).toContain(
      "The author can open a conversation",
    );
    expect(mocks.client.requestPostContact).toHaveBeenCalledTimes(2);
    expect(mocks.client.requestPostContact).toHaveBeenLastCalledWith({
      postId: "42",
      intro: "May I visit?",
    });
    expect(within(sheet).queryByRole("alert")).toBeNull();
  });

  it("retries the Post read before enabling contact", async () => {
    mocks.report.mockRejectedValueOnce(new Error("offline"));
    mountAt("/?tab=activity&section=messages&messageKind=post&messageResource=42");
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(await within(sheet).findByText("Couldn't load this post.")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Send request" })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Retry" }));
    expect(await within(sheet).findByLabelText("Introduce yourself")).toBeTruthy();
    expect(mocks.report).toHaveBeenCalledTimes(2);
    expect(mocks.client.requestPostContact).not.toHaveBeenCalled();
  });

  it("recovers a failed inbox read, loads older requests, and retries a declined response", async () => {
    const incoming: PostContactRequest = {
      ...pending,
      direction: "incoming",
      requester: { address: AMINA, username: null, avatar: null },
    };
    const older: PostContactRequest = {
      ...pending,
      id: "older",
      postId: "41",
      postTitle: "Older Post",
    };
    let finish: (item: PostContactRequest) => void = () => {};
    mocks.client.postRequests
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [incoming], nextCursor: "older-cursor" })
      .mockResolvedValueOnce({ items: [older], nextCursor: null })
      .mockResolvedValue({ items: [{ ...incoming, status: "declined" }], nextCursor: null });
    mocks.client.setPostRequestStatus
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(
        () =>
          new Promise<PostContactRequest>((resolve) => {
            finish = resolve;
          }),
      );
    mountAt("/?tab=activity&section=messages");
    expect(await screen.findByText("Couldn't load Post requests.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const heading = await screen.findByRole("heading", { name: "Post requests" });
    const requests = within(heading.closest("section")!);
    expect(await requests.findByText(AMINA)).toBeTruthy();
    fireEvent.click(requests.getByRole("button", { name: "Load more" }));
    expect(await requests.findByRole("link", { name: "Post: Older Post" })).toBeTruthy();
    expect(mocks.client.postRequests).toHaveBeenCalledWith("older-cursor", expect.anything());
    fireEvent.click(requests.getByRole("button", { name: "Decline" }));
    expect(await requests.findByRole("alert")).toBeTruthy();
    fireEvent.click(requests.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(mocks.client.setPostRequestStatus).toHaveBeenCalledTimes(2));
    expect((requests.getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((requests.getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await act(async () => finish({ ...incoming, status: "declined" }));
    expect(await requests.findByText("Declined")).toBeTruthy();
    expect(requests.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(requests.queryByRole("alert")).toBeNull();
    expect(mocks.client.setPostRequestStatus).toHaveBeenLastCalledWith(incoming.id, "declined");
  });
});

describe("Helpdesk section", () => {
  it("starts the helpdesk conversation and opens it", async () => {
    mocks.client.helpdesk.mockResolvedValue(
      conversation(11, { kind: "helpdesk", status: "open", peer: null }),
    );
    const { router } = mountAt("/?tab=activity&section=helpdesk");
    fireEvent.click(await screen.findByRole("button", { name: "Contact support" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/11"));
    expect(mocks.client.list).toHaveBeenCalledWith(
      { kind: "helpdesk", cursor: undefined },
      expect.anything(),
    );
  });

  it("lists the existing helpdesk conversation as Support", async () => {
    mocks.client.list.mockResolvedValue({
      items: [conversation(11, { kind: "helpdesk", status: "open", peer: null, unreadCount: 2 })],
      nextCursor: null,
    });
    mountAt("/?tab=activity&section=helpdesk");
    const region = await screen.findByRole("region", { name: "Helpdesk" });
    expect(within(region).getByText("Support")).toBeTruthy();
  });

  it("shows the operator queue instead of Contact support to an Admin", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
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

    mountAt("/?tab=activity&section=helpdesk");

    expect(await screen.findByText("amina")).toBeTruthy();
    expect(screen.getByText("Please help with my voucher")).toBeTruthy();
    expect(screen.getByText("Needs reply")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Contact support" })).toBeNull();
    expect(mocks.admin.helpdeskQueue).toHaveBeenCalledWith(
      { status: "open", cursor: undefined },
      expect.anything(),
    );
  });

  it("lets an Admin read, reply to, and resolve a Helpdesk conversation", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
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

    mountAt("/?tab=activity&section=helpdesk&helpdeskId=21");

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

    fireEvent.click(screen.getByRole("button", { name: "Resolve conversation" }));
    await waitFor(() => expect(mocks.admin.setHelpdeskStatus).toHaveBeenCalledWith(21, "resolved"));
  });

  it("lets an Admin reopen a resolved Helpdesk conversation", async () => {
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
    mocks.admin.setHelpdeskStatus.mockRejectedValue(new BackendApiError(400, "refused"));

    mountAt("/?tab=activity&section=helpdesk&helpdeskStatus=resolved&helpdeskId=21");

    expect(await screen.findByRole("heading", { name: "admin-user-21" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reopen conversation" }));
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
    mountAt(
      `/?tab=activity&section=helpdesk${status === "resolved" ? "&helpdeskStatus=resolved" : ""}`,
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

    mountAt("/?tab=activity&section=helpdesk&helpdeskStatus=resolved");

    expect(await screen.findByText("Photo")).toBeTruthy();
    expect(screen.getByText("No messages")).toBeTruthy();
    expect(screen.queryByText("Needs reply")).toBeNull();
  });

  it("recovers and paginates the Admin queue", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
    };
    mocks.admin.helpdeskQueue.mockRejectedValueOnce(new BackendApiError(400, "refused"));
    mountAt("/?tab=activity&section=helpdesk");
    expect(await screen.findByText("Couldn't load the helpdesk.")).toBeTruthy();

    mocks.admin.helpdeskQueue
      .mockResolvedValueOnce({ items: [adminHelpdeskItem(21, "First page")], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [adminHelpdeskItem(22, "Second page")], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("First page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second page")).toBeTruthy();
    expect(mocks.admin.helpdeskQueue).toHaveBeenLastCalledWith(
      { status: "open", cursor: "next" },
      expect.anything(),
    );
  });

  it("retries a failed Admin thread and loads its earlier messages", async () => {
    mocks.auth = {
      isAuthenticated: true,
      address: VIEWER,
      session: { address: VIEWER, role: "ADMIN" },
    };
    mocks.admin.helpdeskItem.mockRejectedValueOnce(new BackendApiError(400, "refused"));
    mocks.admin.helpdeskMessages.mockRejectedValueOnce(new BackendApiError(400, "refused"));
    mountAt("/?tab=activity&section=helpdesk&helpdeskId=21");
    expect(await screen.findByText("Couldn't load this conversation.")).toBeTruthy();

    mocks.admin.helpdeskItem.mockResolvedValue(adminHelpdeskItem(21));
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
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Newest")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(await screen.findByText("Older")).toBeTruthy();
  });
});

describe("Notifications section", () => {
  it("shows approval milestones and leaves transactions and messages in their own sections", async () => {
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
      {
        notificationId: "n3",
        kind: "pool.voucher_admitted",
        title: "Voucher approved",
        body: "BEAB was approved in Dadaab Pool.",
        targetUrl: "/pools/0x1111111111111111111111111111111111111111",
        createdAt: "2026-11-09T10:02:00Z",
        receivedAt: "2026-11-09T10:02:00Z",
        priority: "high",
      },
    ]);
    mountAt("/?tab=activity&section=notifications");
    expect(await screen.findByText("Voucher approved")).toBeTruthy();
    expect(screen.queryByText("Voucher received")).toBeNull();
    expect(screen.queryByText("New message")).toBeNull();
  });
});
