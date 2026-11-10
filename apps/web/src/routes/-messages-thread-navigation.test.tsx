import type { Conversation } from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

const mocks = vi.hoisted(() => ({
  enabled: { value: true },
  get: vi.fn(),
  messages: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("#/lib/messaging-config", () => ({
  get MESSAGING_ENABLED() {
    return mocks.enabled.value;
  },
}));
vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks }));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn() }),
}));

import { Route as ThreadRoute } from "./messages/$conversationId";

const conversation: Conversation = {
  id: 5,
  kind: "direct",
  status: "accepted",
  peer: { address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d", username: "amina", avatar: null },
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
};

function mountAt(entry: string) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
      tab: typeof search.tab === "string" ? search.tab : undefined,
      section: typeof search.section === "string" ? search.section : undefined,
    }),
    component: () => (
      <Link to="/messages/$conversationId" params={{ conversationId: "5" }}>
        Open thread
      </Link>
    ),
  });
  const thread = ThreadRoute.update({
    getParentRoute: () => root,
    path: "messages/$conversationId",
  } as never);
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
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.value = true;
  mocks.get.mockResolvedValue(conversation);
  mocks.messages.mockResolvedValue({ items: [], hasMore: false });
  mocks.markRead.mockResolvedValue(undefined);
});

describe("thread navigation", () => {
  it("returns to the inbox it was opened from with Back", async () => {
    const router = mountAt("/?tab=activity&section=messages");
    fireEvent.click(await screen.findByText("Open thread"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/5"));
    expect(await screen.findByRole("heading", { name: "amina" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Messages" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({ tab: "activity", section: "messages" });
    expect(router.history.length).toBe(2);
  });

  it("falls back to Messages when the thread was opened directly", async () => {
    const router = mountAt("/messages/5");
    expect(await screen.findByRole("heading", { name: "amina" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Messages" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({ tab: "activity", section: "messages" });
  });

  it("sends a malformed thread id back to Messages", async () => {
    const router = mountAt("/messages/abc");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({ tab: "activity", section: "messages" });
  });

  it("keeps threads closed while messaging is off", async () => {
    mocks.enabled.value = false;
    const router = mountAt("/messages/5");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({ tab: "activity" });
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
