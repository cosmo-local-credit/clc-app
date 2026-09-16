import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProfileResult } from "@clc/api/features/auth/client";

const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const SHORT = "0x33a573…5c2645";

const getProfile = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    auth: {
      getProfile: () => getProfile(),
    },
  },
}));

vi.mock("#/features/auth/admin-session", () => ({
  useAdminSession: () => ({
    status: "authenticated",
    operator: { address: ADDRESS, role: "SUPERADMIN" },
  }),
  useAdminSignOut: () => ({ isPending: false, mutate: signOut }),
}));

const { OperatorMenu } = await import("./operator-menu");

function profile(overrides: Partial<ProfileResult> = {}): ProfileResult {
  return {
    address: ADDRESS,
    name: "Ada Lovelace",
    email: "ada@example.test",
    phone: "",
    country: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderMenu() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: OperatorMenu,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <p>settings page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  getProfile.mockReset();
  signOut.mockReset();
  getProfile.mockResolvedValue(profile());
});

describe("OperatorMenu", () => {
  it("shows the operator's name rather than the shortened address", async () => {
    renderMenu();

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByText(SHORT)).toBeNull();
  });

  it("opens a menu with a copyable shortened address, settings, and sign out", async () => {
    renderMenu();
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    expect(await screen.findByText(SHORT)).toBeTruthy();
    expect(screen.queryByText(ADDRESS)).toBeNull();
    expect(screen.getByRole("menuitem", { name: /copy address/i })).toBeTruthy();

    const settings = screen.getByRole("menuitem", { name: /settings/i });
    expect(settings.getAttribute("href")).toBe("/settings");

    const logout = screen.getByRole("menuitem", { name: /sign out/i });
    expect(logout.getAttribute("data-variant")).toBe("destructive");
  });

  it("signs out from the menu", async () => {
    renderMenu();
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("falls back to the shortened address when the profile has no name", async () => {
    getProfile.mockResolvedValue(profile({ name: "  " }));
    renderMenu();

    expect(await screen.findByText(SHORT)).toBeTruthy();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
  });
});
