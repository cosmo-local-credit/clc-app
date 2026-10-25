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
  post: {} as Record<string, unknown>,
  approve: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@clc/api/features/reports/queries", () => ({
  adminReportQueryOptions: (_client: unknown, id: string) => ({
    queryKey: ["admin-report", id],
    queryFn: () => mocks.post,
  }),
}));

vi.mock("./use-post-mutations", () => ({
  useApprovePost: () => ({ mutateAsync: mocks.approve, isPending: false }),
  useDeletePost: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));

import { PostDetailPage } from "./post-detail-page";

const AUTHOR = "0xAbC0000000000000000000000000000000000123";

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "4633",
    title: "August community harvest",
    description: "Seven members helped.",
    body: "## What happened\n\nTwenty took part.",
    imageUrl: "https://content.example/one.jpg",
    locationName: null,
    lat: -1.2864,
    lng: 36.8172,
    periodFrom: "2026-08-01T08:00:00Z",
    periodTo: "2026-08-01T12:00:00Z",
    authorAddress: AUTHOR,
    createdAt: "2026-08-01T08:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    tags: ["Agriculture"],
    vouchers: [
      {
        id: "17",
        chainId: 100,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Sarafu",
        symbol: "SRF",
      },
    ],
    pools: [],
    images: [
      {
        url: "https://content.example/one.jpg",
        width: 267,
        height: 1000,
        maxWidth: 1600,
        maxHeight: 747,
        byteSize: 245_761,
        caption: "Sorting",
      },
    ],
    attachments: [
      {
        kind: "FILE",
        url: "https://content.example/notes.pdf",
        filename: "notes.pdf",
        byteSize: 81_920,
      },
    ],
    hostName: "Wendo Group",
    participants: "20",
    timeTaken: "4 hours",
    status: "SUBMITTED",
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/posts/$reportId",
    component: () => <PostDetailPage reportId="4633" />,
  });
  const list = createRoute({
    getParentRoute: () => root,
    path: "/posts",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <div>Posts table</div>,
  });
  const editor = createRoute({
    getParentRoute: () => root,
    path: "/posts/$reportId/edit",
    component: () => <div>Editor</div>,
  });
  const voucher = createRoute({
    getParentRoute: () => root,
    path: "/vouchers/$address",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <div>Voucher</div>,
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: "/users/$address",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <div>Account</div>,
  });

  const router = createRouter({
    routeTree: root.addChildren([list, editor, detail, voucher, account]),
    history: createMemoryHistory({ initialEntries: ["/posts/4633"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mocks.post = post();
  mocks.approve.mockReset().mockResolvedValue(post({ status: "APPROVED" }));
  mocks.remove.mockReset().mockResolvedValue("4633");
});

describe("the review page", () => {
  // The public detail route answers 404 for a submitted post, which is why this
  // screen reads the admin endpoint.
  it("shows an unapproved post and its status", async () => {
    expect(await findTitle()).toBeTruthy();
    expect(screen.getByLabelText("post state awaiting approval")).toBeTruthy();
  });

  it("renders the body as markdown", async () => {
    await findTitle();
    expect(screen.getByText("What happened").tagName).toBe("H3");
  });

  // An assign-all PUT replaces both, so an operator has to be able to see them
  // before an edit erases one.
  it("shows the fields an edit will replace, including image metadata", async () => {
    await findTitle();

    expect(screen.getByText(/1600×747/)).toBeTruthy();
    expect(screen.getByText(/240 KB/)).toBeTruthy();
    expect(screen.getByText(/display box 267×1000/)).toBeTruthy();
    expect(screen.getByText("Sorting")).toBeTruthy();
    expect(screen.getByText("cover")).toBeTruthy();
    expect(screen.getByText("notes.pdf")).toBeTruthy();
    expect(screen.getByText("80 KB")).toBeTruthy();
    expect(screen.getByText("Wendo Group")).toBeTruthy();
    expect(screen.getByText("-1.2864, 36.8172")).toBeTruthy();
    expect(screen.getByText("Agriculture")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sarafu" })).toBeTruthy();
  });

  it("offers no approval for an approved post", async () => {
    mocks.post = post({ status: "APPROVED" });
    await findTitle();

    // Nothing left to approve.
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });
});

describe("moderation actions", () => {
  it("confirms before approving", async () => {
    await findTitle();

    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(mocks.approve).not.toHaveBeenCalled();

    expect(await screen.findByText("Approve this post?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Approve$/ }));

    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith("4633"));
  });

  // Leaving before the delete lands would take the operator back to a table
  // that still lists the row.
  it("returns to the table only after the delete succeeds", async () => {
    const router = renderPageAndTitle();
    await router.title;

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(await screen.findByText("Delete this post?")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    });

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("4633"));
    await waitFor(() => expect(router.router.state.location.pathname).toBe("/posts"));
  });

  it("stays on the page when the delete fails", async () => {
    mocks.remove.mockRejectedValue(new Error("Still referenced"));
    const router = renderPageAndTitle();
    await router.title;

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Delete permanently" }));
    });

    await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
    expect(router.router.state.location.pathname).toBe("/posts/4633");
    // The dialog stays so the operator can retry or back out.
    expect(screen.getByText("Delete this post?")).toBeTruthy();
  });

  it("links to the editor", async () => {
    await findTitle();
    // A real anchor, so it is focusable and openable in a new tab.
    expect(screen.getByText("Edit").closest("a")?.getAttribute("href")).toBe("/posts/4633/edit");
  });
});

function findTitle() {
  renderPage();
  return screen.findByRole("heading", { name: "August community harvest" });
}

function renderPageAndTitle() {
  const router = renderPage();
  return { router, title: screen.findByRole("heading", { name: "August community harvest" }) };
}
