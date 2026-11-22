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
import { render } from "@testing-library/react";

import { ActivityDesk } from "#/desktop/activity/activity-desk";
import { ConversationDesk } from "#/desktop/messaging/conversation-desk";
import {
  parseActivityHelpdeskId,
  parseActivityHelpdeskStatus,
  parseActivityMessageContext,
  parseActivityMessageTo,
  parseActivityPostContact,
  parseActivitySection,
  pickActivitySearch,
} from "#/lib/navigation/activity-search";

export const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";
export const AMINA = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

export function conversation(id: number, overrides: Partial<Conversation> = {}): Conversation {
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

export function message(
  id: number,
  conversationId: number,
  sender: Message["sender"] = "peer",
  body = `Message ${id}`,
): Message {
  return {
    id,
    conversationId,
    clientId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    sender,
    body,
    imageUrls: [],
    context: null,
    createdAt: "2026-11-09T10:00:00Z",
  };
}

/**
 * Desktop Activity at `/` and the thread route at `/messages/$id`, over a real
 * memory router and a real QueryClient.
 */
export function mountDesk(entry: string, operator = false) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
      tab: typeof search.tab === "string" ? search.tab : undefined,
      ...pickActivitySearch(search),
    }),
    component: function Home() {
      const search = home.useSearch() as unknown as ReturnType<typeof pickActivitySearch>;
      const navigate = home.useNavigate();
      const postId = parseActivityPostContact(search);
      return (
        <ActivityDesk
          section={parseActivitySection(search.section)}
          address={VIEWER}
          operator={operator}
          helpdeskId={parseActivityHelpdeskId(search.helpdeskId)}
          helpdeskStatus={parseActivityHelpdeskStatus(search.helpdeskStatus)}
          messageTo={parseActivityMessageTo(search.messageTo)}
          messageContext={
            postId ? { kind: "post", resourceId: postId } : parseActivityMessageContext(search)
          }
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
    component: function Thread() {
      const { conversationId } = thread.useParams();
      return <ConversationDesk conversationId={Number(conversationId)} />;
    },
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
