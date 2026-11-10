import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const flag = vi.hoisted(() => ({ enabled: true }));
const mocks = vi.hoisted(() => ({ helpdeskQueue: vi.fn() }));

vi.mock("#/lib/messaging-config", () => ({
  get MESSAGING_ENABLED() {
    return flag.enabled;
  },
}));
vi.mock("#/lib/messaging", () => ({ adminMessaging: mocks }));
vi.mock("#/components/layout/operator-menu", () => ({ OperatorMenu: () => null }));
vi.mock("#/components/layout/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("#/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("#/features/retirement/retirement-notification", () => ({
  RetirementPendingBadge: () => null,
}));

import { AppShell } from "#/components/layout/app-shell";
import { HelpdeskQueuePage } from "#/features/messaging/helpdesk-queue-page";
import { helpdeskItem, testQueryClient } from "#/features/messaging/-messaging-fixtures";
import { parseHelpdeskSearch } from "#/features/messaging/messaging-search";
import { Route as AbuseReportsRoute } from "./_shell/abuse-reports";
import { Route as HelpdeskThreadRoute } from "./_shell/helpdesk/$conversationId";
import { Route as HelpdeskQueueRoute } from "./_shell/helpdesk/index";

function mount(entry: string) {
  const client = testQueryClient();
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <AppShell />
      </QueryClientProvider>
    ),
  });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <p>home</p> });
  const queue = createRoute({
    getParentRoute: () => root,
    path: "/helpdesk",
    validateSearch: parseHelpdeskSearch,
    component: () => <HelpdeskQueuePage search={queue.useSearch()} />,
  });
  const thread = createRoute({
    getParentRoute: () => root,
    path: "/helpdesk/$conversationId",
    component: () => <p>thread {useParams({ strict: false }).conversationId ?? ""}</p>,
  });
  const reports = createRoute({
    getParentRoute: () => root,
    path: "/abuse-reports",
    component: () => <p>reports</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, queue, thread, reports]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("messaging navigation", () => {
  it("reaches the helpdesk from the sidebar, and Back returns from a thread to the filtered queue", async () => {
    mocks.helpdeskQueue.mockResolvedValue({
      items: [helpdeskItem(9, { status: "resolved", needsReply: false })],
      nextCursor: null,
    });
    const router = mount("/");
    await screen.findByText("home");
    expect(screen.getByRole("link", { name: "Abuse reports" }).getAttribute("href")).toBe(
      "/abuse-reports",
    );
    fireEvent.click(screen.getByRole("link", { name: "Helpdesk" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/helpdesk"));

    fireEvent.change(await screen.findByLabelText("Status"), { target: { value: "resolved" } });
    await waitFor(() => expect(router.state.location.search).toEqual({ status: "resolved" }));
    await waitFor(() => expect(router.state.status).toBe("idle"));
    fireEvent.click(await screen.findByRole("link", { name: "amina" }));
    expect(await screen.findByText("thread 9")).toBeTruthy();

    act(() => router.history.back());
    await waitFor(() => expect(router.state.location.pathname).toBe("/helpdesk"));
    expect(router.state.location.search).toEqual({ status: "resolved" });
    expect(await screen.findByRole("link", { name: "amina" })).toBeTruthy();
  });

  it("redirects every messaging route home while the flag is off", () => {
    flag.enabled = false;
    try {
      for (const route of [HelpdeskQueueRoute, HelpdeskThreadRoute, AbuseReportsRoute]) {
        const beforeLoad = route.options.beforeLoad as (() => void) | undefined;
        let thrown: unknown;
        try {
          beforeLoad?.();
        } catch (error) {
          thrown = error;
        }
        expect(isRedirect(thrown)).toBe(true);
      }
    } finally {
      flag.enabled = true;
    }
  });
});
