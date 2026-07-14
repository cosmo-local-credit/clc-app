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

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    state: "guest",
    isLoading: false,
    isAuthenticated: false,
  }),
}));

vi.mock("./sign-in-panel", () => ({
  SignInPanel: () => null,
}));

import { AuthenticatedRoute } from "./authenticated-route";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthenticatedRoute", () => {
  it("removes the auth gate from history when returning to market", async () => {
    const rootRoute = createRootRoute({ component: Outlet });
    const marketRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <div>Market page</div>,
    });
    const protectedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/wallet/send",
      component: () => (
        <AuthenticatedRoute>
          <div>Protected page</div>
        </AuthenticatedRoute>
      ),
    });
    const history = createMemoryHistory({
      initialEntries: ["/?tab=market", "/wallet/send"],
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([marketRoute, protectedRoute]),
      history,
    });

    await router.load();
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole("link", { name: "Back to market" }));
    await screen.findByText("Market page");

    await act(async () => {
      history.back();
    });

    await waitFor(() => {
      expect(history.location.href).toBe("/?tab=market");
      expect(screen.getByText("Market page")).toBeTruthy();
    });
  });
});
