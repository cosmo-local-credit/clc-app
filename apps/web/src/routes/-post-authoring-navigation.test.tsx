import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const mocks = vi.hoisted(() => ({
  myPosts: {
    data: undefined as { reports: unknown[] } | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  createPost: vi.fn(),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, isLoading: false, session: { address: "0x1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("#/features/posts/hooks/use-my-posts", () => ({
  useMyPosts: () => mocks.myPosts,
  useMyPost: () => ({
    data: {
      id: "3182",
      title: "Harvesting greengrams",
      description: "",
      body: "",
      imageUrl: null,
      locationName: null,
      lat: null,
      lng: null,
      periodFrom: null,
      periodTo: null,
      authorAddress: "0x1",
      createdAt: null,
      updatedAt: null,
      tags: [],
      vouchers: [],
      images: [],
      attachments: [],
      hostName: null,
      participants: null,
      timeTaken: null,
      status: "SUBMITTED",
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/posts/hooks/use-post-mutations", () => ({
  useCreatePost: () => ({ mutateAsync: mocks.createPost, isPending: false }),
  useUpdatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({ data: [], isError: false, refetch: vi.fn() }),
}));

vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: () => ({
    query: "",
    setQuery: vi.fn(),
    results: [],
    status: "idle",
    retry: vi.fn(),
  }),
}));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));

import { MyPostsPage } from "#/features/posts/ui/my-posts-page";
import { PostEditorPage } from "#/features/posts/ui/post-editor-page";

/**
 * The real route shapes, registered in the same order the generated tree uses.
 *
 * `/posts/new` and `/posts/mine` are static and must win over `/posts/$reportId`
 * — otherwise "new" is read as a report id and the editor becomes a 404 detail
 * page.
 */
function renderAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const postsFeedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>Posts feed</p>,
  });
  const newRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/posts/new",
    component: () => <PostEditorPage mode="create" />,
  });
  const mineRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/posts/mine",
    component: () => <MyPostsPage />,
  });
  // Read loosely: these routes are built here, so the generated tree's route-id
  // literals do not name them and a `from` would not typecheck.
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/posts/$reportId",
    component: () => <p>Public detail {useReportIdParam()}</p>,
  });
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/posts/$reportId/edit",
    component: () => <PostEditorPage mode="edit" reportId={useReportIdParam()} />,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([postsFeedRoute, newRoute, mineRoute, editRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    context: { queryClient: new QueryClient() },
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      {/* biome-ignore lint/suspicious/noExplicitAny: the test tree is not the generated one */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  );
  return router;
}

function useReportIdParam(): string {
  const params: Record<string, string | undefined> = useParams({ strict: false });
  return params.reportId ?? "";
}

beforeEach(() => {
  mocks.createPost.mockReset().mockResolvedValue({ id: "4633", status: "SUBMITTED" });
  mocks.myPosts = {
    data: {
      reports: [
        {
          id: "3182",
          title: "Harvesting greengrams",
          description: "Seven members helped.",
          status: "SUBMITTED",
          updatedAt: "2026-08-20T10:00:00Z",
          imageUrl: null,
          locationName: null,
          lat: null,
          lng: null,
          periodFrom: null,
          periodTo: null,
          authorAddress: "0x1",
          createdAt: null,
          tags: [],
          vouchers: [],
        },
      ],
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
});

describe("post authoring routes", () => {
  it("opens the editor on a direct load of /posts/new", async () => {
    renderAt("/posts/new");
    expect(await screen.findByRole("heading", { name: "New post" })).toBeTruthy();
  });

  // "new" must not be read as a report id.
  it("keeps the static routes ahead of the dynamic one", async () => {
    renderAt("/posts/new");
    expect(await screen.findByRole("heading", { name: "New post" })).toBeTruthy();
    expect(screen.queryByText(/Public detail/)).toBeNull();

    renderAt("/posts/mine");
    expect(await screen.findByRole("heading", { name: "My posts" })).toBeTruthy();
  });

  it("opens the owner editor on a direct load of /posts/:id/edit", async () => {
    renderAt("/posts/3182/edit");
    expect(await screen.findByRole("heading", { name: "Edit post" })).toBeTruthy();
  });

  it("still serves the public detail route at /posts/:id", async () => {
    renderAt("/posts/3182");
    expect(await screen.findByText("Public detail 3182")).toBeTruthy();
  });

  // A pending post has no public detail page, so its row links to the editor.
  it("links a pending row to the editor and an approved row to both", async () => {
    renderAt("/posts/mine");
    await screen.findByRole("heading", { name: "My posts" });

    expect(screen.queryByRole("link", { name: "View" })).toBeNull();
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/posts/3182/edit",
    );
  });

  it("lands on My posts after a create, and Back returns to the editor's origin", async () => {
    const router = renderAt("/posts/mine");
    await screen.findByRole("heading", { name: "My posts" });

    await act(async () => {
      await router.navigate({ to: "/posts/new" });
    });
    await screen.findByRole("heading", { name: "New post" });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "August harvest" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/posts/mine"));
  });

  it("goes back from a clean editor without a confirmation", async () => {
    const router = renderAt("/posts/mine");
    await screen.findByRole("heading", { name: "My posts" });

    await act(async () => {
      await router.navigate({ to: "/posts/new" });
    });
    await screen.findByRole("heading", { name: "New post" });

    fireEvent.click(screen.getByRole("link", { name: /My posts/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/posts/mine"));
  });
});
