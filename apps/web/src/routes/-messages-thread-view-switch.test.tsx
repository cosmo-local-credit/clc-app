import type { Conversation } from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DESKTOP_MEDIA } from "#/desktop/layout";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

const mocks = vi.hoisted(() => ({
  unread: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  messages: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks }));
vi.mock("#/features/wallet/hooks/use-activity-unseen", () => ({
  useActivityUnseen: () => ({ count: 0 }),
  useActivityVisit: () => () => false,
}));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));

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

const originalMatchMedia = window.matchMedia;

function mountAt(desktop: boolean) {
  document.documentElement.dataset.layout = desktop ? "desktop" : "mobile";
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query === DESKTOP_MEDIA && desktop,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const root = createRootRoute({ component: Outlet });
  const thread = ThreadRoute.update({
    getParentRoute: () => root,
    path: "messages/$conversationId",
  } as never);
  const router = createRouter({
    routeTree: root.addChildren([thread]),
    history: createMemoryHistory({ initialEntries: ["/messages/5"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.unread.mockResolvedValue({ direct: 0, requests: 0, helpdesk: 0 });
  mocks.list.mockResolvedValue({ items: [conversation], nextCursor: null });
  mocks.get.mockResolvedValue(conversation);
  mocks.messages.mockResolvedValue({ items: [], hasMore: false });
  mocks.markRead.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.stubGlobal("matchMedia", originalMatchMedia);
  delete document.documentElement.dataset.layout;
});

describe("the thread route on each layout", () => {
  it("declares its own desktop canvas rather than the 430px phone column", () => {
    expect(ThreadRoute.options.staticData).toMatchObject({ desktop: "fill" });
  });

  it("opens the thread beside the Messages list on the desktop", async () => {
    mountAt(true);
    expect(await screen.findByRole("heading", { name: "amina" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "New message" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Activity sections" })).toBeTruthy();
  });

  it("keeps the phone thread on the phone", async () => {
    mountAt(false);
    expect(await screen.findByRole("heading", { name: "amina" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Activity sections" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New message" })).toBeNull();
  });
});
