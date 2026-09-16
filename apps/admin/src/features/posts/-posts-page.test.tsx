import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  params: [] as Array<Record<string, unknown>>,
  page: {
    reports: [] as Array<Record<string, unknown>>,
    first: null as { updatedAt: string; id: string } | null,
    last: null as { updatedAt: string; id: string } | null,
    receivedCount: 0,
  },
  approve: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@clc/api/features/reports/queries", () => ({
  adminReportsQueryOptions: (_client: unknown, params: Record<string, unknown>) => {
    mocks.params.push(params);
    return {
      queryKey: ["admin-reports", JSON.stringify(params)],
      queryFn: () => mocks.page,
    };
  },
}));

vi.mock("./use-post-mutations", () => ({
  useApprovePost: () => ({ mutateAsync: mocks.approve, isPending: false }),
  useDeletePost: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PostsPage } from "./posts-page";
import { parsePostSearch } from "./post-search";

const AUTHOR = "0xAbC0000000000000000000000000000000000123";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "4633",
    title: "August community harvest",
    description: "Seven members helped.",
    status: "SUBMITTED",
    imageUrl: null,
    locationName: null,
    lat: null,
    lng: null,
    periodFrom: null,
    periodTo: null,
    authorAddress: AUTHOR,
    createdAt: "2026-08-01T08:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    tags: ["Agriculture"],
    vouchers: [],
    ...overrides,
  };
}

/**
 * Base UI commits an item without a prior highlight only for a touch pointer,
 * and jsdom fires no hover — the same helper the publish-page tests use.
 */
function selectOption(trigger: HTMLElement, optionName: string) {
  fireEvent.click(trigger);
  const option = screen.getByRole("option", { name: optionName });
  fireEvent.pointerDown(option, { pointerType: "touch" });
  fireEvent.click(option);
}

function renderPage(query = "") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const posts = createRoute({
    getParentRoute: () => root,
    path: "/posts",
    validateSearch: parsePostSearch,
    component: () => <PostsPage search={posts.useSearch()} />,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/posts/$reportId",
    component: () => <div>Post detail</div>,
  });
  const editor = createRoute({
    getParentRoute: () => root,
    path: "/posts/new",
    component: () => <div>New post form</div>,
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: "/users/$address",
    component: () => <div>Account detail</div>,
  });

  const router = createRouter({
    routeTree: root.addChildren([posts, editor, detail, account]),
    history: createMemoryHistory({ initialEntries: [`/posts${query}`] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mocks.params = [];
  mocks.approve.mockReset().mockResolvedValue({ id: "4633", status: "APPROVED" });
  mocks.remove.mockReset().mockResolvedValue("4633");
  mocks.page = { reports: [row()], first: null, last: null, receivedCount: 1 };
});

describe("the default queue", () => {
  // An operator opening this screen is here to review what is waiting.
  it("asks for submitted posts when the URL says nothing", async () => {
    renderPage();
    await screen.findByText("August community harvest");

    expect(mocks.params.at(-1)).toMatchObject({ status: "SUBMITTED" });
  });

  it("shows the status of every row", async () => {
    mocks.page = {
      reports: [row(), row({ id: "4634", title: "Approved one", status: "APPROVED" })],
      first: null,
      last: null,
      receivedCount: 2,
    };
    renderPage();
    await screen.findByText("August community harvest");

    expect(screen.getByLabelText("post state awaiting approval")).toBeTruthy();
    expect(screen.getByLabelText("post state approved")).toBeTruthy();
  });

  // An empty default queue is good news, not "no posts exist".
  it("names the active filter in the empty state", async () => {
    mocks.page = { reports: [], first: null, last: null, receivedCount: 0 };
    renderPage();

    expect(await screen.findByText("Nothing awaiting approval")).toBeTruthy();
  });

  it("names an explicit status filter in the empty state", async () => {
    mocks.page = { reports: [], first: null, last: null, receivedCount: 0 };
    renderPage("?status=REJECTED");

    expect(await screen.findByText("No not approved posts")).toBeTruthy();
  });
});

describe("URL state", () => {
  it("keeps the status in the URL and drops the cursor when it changes", async () => {
    const router = renderPage(
      "?status=APPROVED&cursorUpdatedAt=2026-08-20T10%3A00%3A00Z&cursorId=4633&dir=next",
    );
    await screen.findByText("August community harvest");

    expect(mocks.params.at(-1)).toMatchObject({
      status: "APPROVED",
      // Coerced back to text: the router's parser reads the id as a number.
      cursor: { updatedAt: "2026-08-20T10:00:00Z", id: "4633" },
      next: true,
    });

    // The status control is a real navigation, not component state.
    selectOption(screen.getByLabelText("Status"), "All");

    await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "ALL" }));
    // A cursor issued for the approved set names no page of the all-status one.
    expect(router.state.location.search).not.toHaveProperty("cursorId");
    // ALL is a URL sentinel, never sent to clc-core.
    await waitFor(() => expect(mocks.params.at(-1)?.status).toBeUndefined());
  });

  // The whole reason this state lives in the URL.
  it("restores the exact view on Back", async () => {
    const router = renderPage("?status=APPROVED&perPage=25&q=harvest");
    await screen.findByText("August community harvest");

    selectOption(screen.getByLabelText("Status"), "All");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "ALL" }));

    await act(async () => {
      router.history.back();
    });

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        status: "APPROVED",
        perPage: 25,
        q: "harvest",
      }),
    );
    expect(mocks.params.at(-1)).toMatchObject({ status: "APPROVED", perPage: 25 });
  });

  it("sends an author filter through to the endpoint", async () => {
    renderPage(`?author=${AUTHOR}`);
    await screen.findByText("August community harvest");

    expect(mocks.params.at(-1)).toMatchObject({ author: AUTHOR });
  });

  // The raw draft stays in the URL so the field keeps the character; the
  // request is what drops it, because clc-core rejects a one-character term.
  it("keeps a one-character draft out of the request", async () => {
    renderPage("?q=h");
    await screen.findByText("August community harvest");

    expect((screen.getByLabelText("Title or summary") as HTMLInputElement).value).toBe("h");
    expect(mocks.params.at(-1)?.filter).toMatchObject({ term: "" });
  });

  it("sends a searchable term through to the endpoint", async () => {
    renderPage("?q=harvest");
    await screen.findByText("August community harvest");

    expect(mocks.params.at(-1)?.filter).toMatchObject({ term: "harvest" });
  });
});

describe("row actions", () => {
  // Approval is not reversible in this contract.
  it("confirms before approving, and says approval cannot be undone", async () => {
    renderPage();
    await screen.findByText("August community harvest");

    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));

    expect(mocks.approve).not.toHaveBeenCalled();
    expect(await screen.findByText("Approve this post?")).toBeTruthy();
    expect(screen.getByText(/no unapprove/)).toBeTruthy();

    // The dialog's own button, not the row's — the row's reads "Approve" too.
    fireEvent.click(screen.getByRole("button", { name: /^Approve$/ }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith("4633"));
  });

  // An approved post has nothing to approve.
  it("offers no Approve on an approved row", async () => {
    mocks.page = {
      reports: [row({ status: "APPROVED" })],
      first: null,
      last: null,
      receivedCount: 1,
    };
    renderPage("?status=APPROVED");
    await screen.findByText("August community harvest");

    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });

  it("confirms before a hard delete and describes what goes with it", async () => {
    renderPage();
    await screen.findByText("August community harvest");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(await screen.findByText("Delete this post?")).toBeTruthy();
    expect(screen.getByText(/tags, voucher links, images and attachments/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("4633"));
  });

  it("backs out of a confirmation without acting", async () => {
    renderPage();
    await screen.findByText("August community harvest");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Delete this post?")).toBeNull());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("links each row to its review page and its author", async () => {
    renderPage();
    await screen.findByText("August community harvest");

    expect(
      screen.getByRole("link", { name: "August community harvest" }).getAttribute("href"),
    ).toBe("/posts/4633");
    expect(screen.getByRole("link", { name: /0xAbC000/ }).getAttribute("href")).toContain(
      "/users/0xAbC0000000000000000000000000000000000123",
    );
  });
});
