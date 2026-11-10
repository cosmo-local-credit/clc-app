import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HelpdeskQueuePage } from "./helpdesk-queue-page";
import { helpdeskItem, message, never, OTHER_USER, testQueryClient } from "./-messaging-fixtures";
import { parseHelpdeskSearch } from "./messaging-search";

const mocks = vi.hoisted(() => ({ helpdeskQueue: vi.fn() }));
vi.mock("#/lib/messaging", () => ({ adminMessaging: mocks }));

function mount(entry = "/helpdesk") {
  const client = testQueryClient();
  const root = createRootRoute({ component: Outlet });
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
  const account = createRoute({
    getParentRoute: () => root,
    path: "/users/$address",
    component: () => <p>account</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([queue, thread, account]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("helpdesk queue", () => {
  it("shows a loading block, not an empty queue, while the first page is pending", async () => {
    mocks.helpdeskQueue.mockReturnValue(never());
    mount();
    await waitFor(() => expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy());
    expect(screen.queryByText("No open conversations")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says the queue is empty only after a successful empty answer", async () => {
    mocks.helpdeskQueue.mockResolvedValue({ items: [], nextCursor: null });
    mount();
    expect(await screen.findByText("No open conversations")).toBeTruthy();
    expect(mocks.helpdeskQueue).toHaveBeenCalledWith(
      { status: "open", cursor: undefined },
      expect.any(AbortSignal),
    );
  });

  it("shows a failure as a failure and retries on request", async () => {
    mocks.helpdeskQueue.mockRejectedValueOnce(new Error("Service unavailable"));
    mount();
    expect(await screen.findByText("Could not load the helpdesk queue")).toBeTruthy();
    expect(screen.getByText("Service unavailable")).toBeTruthy();
    expect(screen.queryByText("No open conversations")).toBeNull();

    mocks.helpdeskQueue.mockResolvedValue({ items: [helpdeskItem(7)], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "amina" })).toBeTruthy();
  });

  it("lists who is waiting, then appends the next page through the opaque cursor", async () => {
    mocks.helpdeskQueue.mockImplementation(({ cursor }: { cursor?: string }) =>
      Promise.resolve(
        cursor === "page-2"
          ? {
              items: [
                helpdeskItem(8, {
                  user: OTHER_USER,
                  needsReply: false,
                  lastMessage: message(200, { sender: "support", body: "Fixed now" }),
                }),
              ],
              nextCursor: null,
            }
          : { items: [helpdeskItem(7)], nextCursor: "page-2" },
      ),
    );
    mount();
    expect(await screen.findByRole("link", { name: "amina" })).toBeTruthy();
    expect(screen.getByText("Needs reply")).toBeTruthy();
    expect(screen.getByText("Message 107")).toBeTruthy();
    expect(screen.getByText("1 waiting for a reply in the loaded rows")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "baraka" })).toBeTruthy();
    expect(mocks.helpdeskQueue).toHaveBeenLastCalledWith(
      { status: "open", cursor: "page-2" },
      expect.any(AbortSignal),
    );
    // Both pages stay on screen, and the pager is gone once the cursor runs out.
    expect(screen.getByRole("link", { name: "amina" })).toBeTruthy();
    expect(screen.getByText("Fixed now")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("2 conversations")).toBeTruthy();
  });

  it("keeps the status filter in the URL and Back restores the open queue", async () => {
    mocks.helpdeskQueue.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve({
        items:
          status === "resolved" ? [helpdeskItem(9, { status: "resolved", needsReply: false })] : [],
        nextCursor: null,
      }),
    );
    const { router } = mount();
    await screen.findByText("No open conversations");

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "resolved" } });
    await waitFor(() => expect(router.state.location.search).toEqual({ status: "resolved" }));
    expect(await screen.findByRole("link", { name: "amina" })).toBeTruthy();
    expect(mocks.helpdeskQueue).toHaveBeenCalledWith(
      { status: "resolved", cursor: undefined },
      expect.any(AbortSignal),
    );

    act(() => router.history.back());
    expect(await screen.findByText("No open conversations")).toBeTruthy();
    expect(router.state.location.search).toEqual({});
  });

  it("opens the thread from anywhere in the row", async () => {
    mocks.helpdeskQueue.mockResolvedValue({ items: [helpdeskItem(7)], nextCursor: null });
    const { router } = mount();
    fireEvent.click(await screen.findByText("Message 107"));
    expect(await screen.findByText("thread 7")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/helpdesk/7");
  });

  it("keeps the account link's own destination inside a clickable row", async () => {
    mocks.helpdeskQueue.mockResolvedValue({ items: [helpdeskItem(7)], nextCursor: null });
    const { router } = mount();
    fireEvent.click(await screen.findByRole("link", { name: /^Account / }));
    expect(await screen.findByText("account")).toBeTruthy();
    expect(router.state.location.pathname).toMatch(/^\/users\//);
  });

  it("opens the thread from the user's name", async () => {
    mocks.helpdeskQueue.mockResolvedValue({ items: [helpdeskItem(7)], nextCursor: null });
    const { router } = mount();
    fireEvent.click(await screen.findByRole("link", { name: "amina" }));
    expect(await screen.findByText("thread 7")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/helpdesk/7");
  });
});
