import { BackendApiError } from "@clc/api/client/errors";
import type { Conversation } from "@clc/core/features/messaging/logic";
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
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { parseActivitySection } from "#/lib/navigation/activity-search";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";
const AMINA = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

const mocks = vi.hoisted(() => ({
  client: {
    unread: vi.fn(),
    list: vi.fn(),
    helpdesk: vi.fn(),
    request: vi.fn(),
  },
  search: vi.fn(),
  inbox: vi.fn(),
}));

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks.client }));
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

function mountAt(entry: string) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
      tab: typeof search.tab === "string" ? search.tab : undefined,
      section: typeof search.section === "string" ? search.section : undefined,
    }),
    component: function Home() {
      const { section } = home.useSearch();
      return <ActivityInbox section={parseActivitySection(section)} />;
    },
  });
  const thread = createRoute({
    getParentRoute: () => root,
    path: "messages/$conversationId",
    component: () => <p>Thread page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, thread]),
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
  mocks.client.unread.mockResolvedValue({ direct: 3, requests: 1, helpdesk: 2 });
  mocks.client.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.search.mockReturnValue({ data: undefined, isDebouncing: false, isFetching: false });
  mocks.inbox.mockResolvedValue([]);
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
    fireEvent.change(await screen.findByPlaceholderText("Username or phone number"), {
      target: { value: "amina" },
    });
    const results = await screen.findByRole("list", { name: "Matching people" });
    expect(within(results).getAllByRole("button", { name: "Message" })).toHaveLength(1);
    fireEvent.click(within(results).getByRole("button", { name: "Message" }));
    fireEvent.change(screen.getByLabelText("Introduce yourself"), {
      target: { value: "Hello from the market" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/7"));
    expect(mocks.client.request).toHaveBeenCalledWith({
      recipientAddress: AMINA,
      intro: "Hello from the market",
    });
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
});

describe("Notifications section", () => {
  it("leaves message kinds out of the inbox", async () => {
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
    mountAt("/?tab=activity&section=notifications");
    expect(await screen.findByText("Voucher received")).toBeTruthy();
    expect(screen.queryByText("New message")).toBeNull();
  });
});
