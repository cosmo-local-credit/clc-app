import type { AppBuildInfo } from "@clc/core/features/app-updates/logic";
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BUILD_INFO } from "../build-info";
import { liveBuildInfoQueryOptions } from "../live-build-info";
import { AppUpdateBanner } from "./app-update-banner";

const { reloadPage, toastError } = vi.hoisted(() => ({
  reloadPage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("#/lib/page-reload", () => ({ reloadPage }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

// The vitest config inlines this build as web/staging/chain 100, milestone 1.
const NEWER: AppBuildInfo = { ...BUILD_INFO, buildId: "b".repeat(64), dirty: false };
const REQUIRED: AppBuildInfo = { ...NEWER, buildNumber: 2, minimumBuild: 2 };

let queryClient: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
let holdMutation: (() => void) | undefined;

function respondWith(body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

function MutationStarter() {
  const mutation = useMutation({
    mutationFn: () =>
      new Promise<void>((resolve) => {
        holdMutation = resolve;
      }),
  });
  return (
    <button type="button" onClick={() => mutation.mutate()}>
      start mutation
    </button>
  );
}

async function renderBanner({
  live,
  path = "/",
  suppressed = false,
}: {
  live?: AppBuildInfo;
  path?: string;
  suppressed?: boolean;
}) {
  if (live) queryClient.setQueryData(liveBuildInfoQueryOptions.queryKey, live);
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AppUpdateBanner suppressed={suppressed} />
        <MutationStarter />
        <Outlet />
      </>
    ),
  });
  const routes = ["/", "/onboarding", "/wallet/send/amount"].map((routePath) =>
    createRoute({ getParentRoute: () => rootRoute, path: routePath, component: () => null }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "start mutation" });
  return router;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  onlineManager.setOnline(true);
  holdMutation?.();
  holdMutation = undefined;
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AppUpdateBanner", () => {
  it("stays hidden while the origin serves this build", async () => {
    await renderBanner({ live: { ...BUILD_INFO, builtAt: "2026-02-01T00:00:00.000Z" } });
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("offers a different deployment and dismisses it for that target only", async () => {
    await renderBanner({ live: NEWER });
    expect(screen.getByText("A new version is available")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("A new version is available")).toBeNull();

    act(() => {
      queryClient.setQueryData(liveBuildInfoQueryOptions.queryKey, {
        ...NEWER,
        buildId: "c".repeat(64),
      });
    });
    expect(await screen.findByText("A new version is available")).toBeTruthy();
  });

  it("requires an update below the live minimum, without a dismiss", async () => {
    await renderBanner({ live: REQUIRED });
    expect(screen.getByText("Update required")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("reloads once after confirming the live deployment", async () => {
    await renderBanner({ live: NEWER });
    respondWith(NEWER);

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/build-info.json",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not reload when the deployment rolled back to this build", async () => {
    await renderBanner({ live: NEWER });
    respondWith(BUILD_INFO);

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(screen.queryByText("A new version is available")).toBeNull());
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("keeps the page and explains when the check fails", async () => {
    await renderBanner({ live: NEWER });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(reloadPage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
  });

  it("does not hold an offline click open until the connection returns", async () => {
    await renderBanner({ live: NEWER });
    onlineManager.setOnline(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    respondWith(NEWER);
    act(() => onlineManager.setOnline(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("rejects a descriptor whose floor no update could meet", async () => {
    await renderBanner({ live: NEWER });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    respondWith({ ...REQUIRED, minimumBuild: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("disables the action while a mutation is in flight", async () => {
    await renderBanner({ live: NEWER });
    fireEvent.click(screen.getByRole("button", { name: "start mutation" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update" }).hasAttribute("disabled")).toBe(true),
    );
  });

  it("does not reload when a mutation starts during the check", async () => {
    await renderBanner({ live: NEWER });
    let respond: (() => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          respond = () => resolve(new Response(JSON.stringify(NEWER)));
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(respond).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "start mutation" }));
    await act(async () => respond?.());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it.each(["/onboarding", "/wallet/send/amount"])("stays hidden on %s", async (path) => {
    await renderBanner({ live: REQUIRED, path });
    expect(screen.queryByText("Update required")).toBeNull();
  });

  it("stays hidden while a paper-wallet import is pending", async () => {
    await renderBanner({ live: REQUIRED, suppressed: true });
    expect(screen.queryByText("Update required")).toBeNull();
  });
});
