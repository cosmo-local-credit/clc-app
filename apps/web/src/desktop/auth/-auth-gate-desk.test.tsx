import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const auth = vi.hoisted(() => ({
  state: "guest",
  isLoading: false,
  isAuthenticated: false,
  retry: vi.fn(),
  retrying: false,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => auth,
}));

import { type AuthGateSlot, AuthGateSlotProvider } from "#/components/auth/auth-gate-slot";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { parseOnboardingSearch } from "#/lib/onboarding-search";
import { DeskAuthRequired, DeskSessionCheckError } from "./auth-gate-desk";

/** What the root route supplies on a desktop layout. */
const DESKTOP_GATE: AuthGateSlot = {
  required: (props) => <DeskAuthRequired {...props} />,
  sessionError: (props) => <DeskSessionCheckError {...props} />,
};

async function renderGate(url = "/wallet/send?to=alice") {
  const root = createRootRoute({
    component: () => (
      <AuthGateSlotProvider value={DESKTOP_GATE}>
        <Outlet />
      </AuthGateSlotProvider>
    ),
  });
  const market = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <p>Market page</p>,
  });
  const send = createRoute({
    getParentRoute: () => root,
    path: "/wallet/send",
    component: () => (
      <AuthenticatedRoute>
        <p>Private send</p>
      </AuthenticatedRoute>
    ),
  });
  const onboarding = createRoute({
    getParentRoute: () => root,
    path: "/onboarding",
    validateSearch: parseOnboardingSearch,
    component: () => <p>Onboarding page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([market, send, onboarding]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  auth.state = "guest";
  auth.isLoading = false;
  auth.isAuthenticated = false;
  auth.retrying = false;
  auth.retry.mockReset();
});

describe("the desktop gate for a guest on a protected route", () => {
  it("is one page-level heading over the two ways in, without the protected page", async () => {
    await renderGate();

    const title = await screen.findByRole("heading", { name: "Sign in to continue" });
    expect(screen.getAllByRole("heading", { level: 1 })).toEqual([title]);
    // The heading and both choices share one tile, not a header and a footer
    // pinned to opposite ends of the canvas.
    const tile = title.closest("section");
    expect(tile).not.toBeNull();
    expect(tile?.contains(screen.getByRole("link", { name: "Create account" }))).toBe(true);
    expect(tile?.contains(screen.getByRole("link", { name: "I already have an account" }))).toBe(
      true,
    );
    expect(screen.queryByText("Private send")).toBeNull();
  });

  it.each([
    ["Create account", "profile"],
    ["I already have an account", "signin"],
  ])("sends %s to onboarding with this page as the way back", async (name, step) => {
    const router = await renderGate("/wallet/send?to=alice");

    fireEvent.click(await screen.findByRole("link", { name }));

    await screen.findByText("Onboarding page");
    expect(router.state.location.pathname).toBe("/onboarding");
    expect(router.state.location.search).toEqual({ step, redirect: "/wallet/send?to=alice" });
  });

  it("replaces the gate in history when going back to the market", async () => {
    const router = await renderGate();

    fireEvent.click(await screen.findByRole("link", { name: "Back to market" }));

    await screen.findByText("Market page");
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows the protected page to a signed-in member", async () => {
    auth.isAuthenticated = true;
    await renderGate();

    expect(await screen.findByText("Private send")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in to continue" })).toBeNull();
  });
});

describe("the desktop session-check error", () => {
  it("offers Retry in the same tile and calls it once", async () => {
    auth.state = "sessionCheckError";
    await renderGate();

    const title = await screen.findByRole("heading", { name: "Session check failed" });
    expect(screen.getAllByRole("heading", { level: 1 })).toEqual([title]);
    expect(screen.getByRole("alert").textContent).toContain("We could not verify your session");
    expect(screen.queryByText("Private send")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(auth.retry).toHaveBeenCalledTimes(1);
  });

  it("marks Retry busy while the check is running", async () => {
    auth.state = "sessionCheckError";
    auth.retrying = true;
    await renderGate();

    const retry = await screen.findByRole("button", { name: "Retry" });
    await waitFor(() => expect(retry.getAttribute("aria-busy")).toBe("true"));
    expect((retry as HTMLButtonElement).disabled).toBe(true);
  });
});
