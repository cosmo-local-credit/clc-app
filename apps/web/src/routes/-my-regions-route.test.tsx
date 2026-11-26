import type { SessionResult } from "@clc/api/features/auth/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { Route } from "./_nav/settings/regions";

const VIEWER = "0x1111111111111111111111111111111111111111";
const OTHER_WALLET = "0x2222222222222222222222222222222222222222";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  myRegions: vi.fn(),
  layout: "mobile",
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => ({ address: VIEWER, chainId: 100, status: "connected" }),
}));
vi.mock("#/providers/auth-bootstrap", () => ({ useReconnectAttempted: () => true }));
vi.mock("#/lib/api/auth", () => ({ authClient: { getSession: mocks.getSession } }));
vi.mock("#/lib/api/regions", () => ({ regionsClient: { myRegions: mocks.myRegions } }));
vi.mock("#/desktop/layout", () => ({ useLayout: () => mocks.layout }));

async function renderRegions(session: SessionResult) {
  mocks.getSession.mockResolvedValue(session);
  const root = createRootRoute({ component: Outlet });
  const regions = createRoute({
    getParentRoute: () => root,
    path: "/settings/regions",
    component: Route.options.component,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/" }),
      createRoute({ getParentRoute: () => root, path: "/onboarding" }),
      regions,
    ]),
    history: createMemoryHistory({ initialEntries: ["/settings/regions"] }),
  });
  await router.load();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.layout = "mobile";
  mocks.getSession.mockReset();
  mocks.myRegions.mockReset().mockResolvedValue([]);
});

it("uses the real sign-in gate when the session belongs to another wallet", async () => {
  await renderRegions({ role: "REGIONAL_ADMIN", address: OTHER_WALLET, chainId: 100 });
  const signIn = await screen.findByRole("link", { name: "I already have an account" });
  expect(
    new URL(signIn.getAttribute("href") ?? "", "https://example.test").searchParams.get("redirect"),
  ).toBe("/settings/regions");
  expect(screen.queryByRole("heading", { name: "My regions" })).toBeNull();
  expect(mocks.myRegions).not.toHaveBeenCalled();
});

it("does not read assignments for an ordinary signed-in user with a direct link", async () => {
  await renderRegions({ role: "USER", address: VIEWER, chainId: 100 });
  await screen.findByText("No active regions are assigned to you.");
  expect(mocks.myRegions).not.toHaveBeenCalled();
});

it.each(["mobile", "desktop"])(
  "loads only the current regional viewer's assignments on %s",
  async (layout) => {
    mocks.layout = layout;
    await renderRegions({ role: "REGIONAL_ADMIN", address: VIEWER, chainId: 100 });
    await screen.findByRole("heading", { name: "My regions" });
    await screen.findByText("No active regions are assigned to you.");
    expect(mocks.myRegions).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
  },
);
