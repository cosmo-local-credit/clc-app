import type { AppBuildInfo } from "@clc/core/features/app-updates/logic";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppUpdateBanner } from "./app-update-banner";
import { BUILD_INFO } from "./build-info";
import { liveBuildInfoQueryOptions } from "./live-build-info";

// The vitest config inlines this build as admin/staging/chain 100, milestone 1.
const NEWER: AppBuildInfo = { ...BUILD_INFO, buildId: "b".repeat(64), dirty: false };
const REQUIRED: AppBuildInfo = { ...NEWER, buildNumber: 2, minimumBuild: 2 };

let queryClient: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let locationDescriptor: PropertyDescriptor | undefined;
let holdMutation: (() => void) | undefined;

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

/** Mirrors the console's `_shell` layout, so route IDs match the real ones. */
async function renderBanner(live: AppBuildInfo, path = "/") {
  queryClient.setQueryData(liveBuildInfoQueryOptions.queryKey, live);
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AppUpdateBanner />
        <MutationStarter />
        <Outlet />
      </>
    ),
  });
  const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: "_shell" });
  const pages = ["/", "/paper-wallets", "/pools/publish", "/posts/new"].map((pagePath) =>
    createRoute({ getParentRoute: () => shellRoute, path: pagePath, component: () => null }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren([shellRoute.addChildren(pages)]),
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
  reload = vi.fn();
  locationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hostname: "admin.test.cosmolocal.credit", reload },
  });
});

afterEach(() => {
  holdMutation?.();
  holdMutation = undefined;
  queryClient.clear();
  vi.unstubAllGlobals();
  if (locationDescriptor) Object.defineProperty(window, "location", locationDescriptor);
});

describe("AppUpdateBanner", () => {
  it("stays hidden while the origin serves this build", async () => {
    await renderBanner(BUILD_INFO);
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("offers a different deployment and can be dismissed", async () => {
    await renderBanner(NEWER);
    expect(screen.getByText("A new version is available.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("A new version is available.")).toBeNull();
  });

  it("requires an update below the live minimum", async () => {
    await renderBanner(REQUIRED);
    expect(screen.getByText("Update required.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("only advises below the minimum on a preview host", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "branch.clc-admin-gnosis.pages.dev", reload },
    });
    await renderBanner(REQUIRED);
    expect(screen.getByText("A new version is available.")).toBeTruthy();
  });

  it("reloads after confirming the live deployment", async () => {
    await renderBanner(NEWER);
    fetchMock.mockResolvedValue(new Response(JSON.stringify(NEWER)));

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("keeps the console and says so when the check fails", async () => {
    await renderBanner(NEWER);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(await screen.findByText(/Could not reach the update/)).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(["/paper-wallets", "/pools/publish", "/posts/new"])(
    "stays hidden on %s, whose work lives outside mutations",
    async (path) => {
      await renderBanner(REQUIRED, path);
      expect(screen.queryByText("Update required.")).toBeNull();
    },
  );

  it("does not reload when the operator opens such a screen during the check", async () => {
    const router = await renderBanner(NEWER);
    let respond: (() => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          respond = () => resolve(new Response(JSON.stringify(NEWER)));
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(respond).toBeDefined());
    router.history.push("/paper-wallets");
    await waitFor(() => expect(router.state.location.pathname).toBe("/paper-wallets"));
    respond?.();

    await waitFor(() => expect(screen.queryByText("A new version is available.")).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reload).not.toHaveBeenCalled();
  });

  it("disables the action while a mutation is in flight", async () => {
    await renderBanner(NEWER);
    fireEvent.click(screen.getByRole("button", { name: "start mutation" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update" }).hasAttribute("disabled")).toBe(true),
    );
  });
});
