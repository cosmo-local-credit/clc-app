import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/auth/authenticated-route", () => ({
  AuthenticatedRoute: ({ children }: { children: unknown }) => children,
}));
vi.mock("#/features/key-rotation/ui/key-rotation-page", () => ({
  KeyRotationPage: () => <h1>Replace sign-in card</h1>,
}));
vi.mock("#/lib/key-rotation-config", () => ({ KEY_ROTATION_ENABLED: true }));

import { BackChevron } from "#/components/wallet/wallet-layout";
import { useRotationSession } from "#/features/key-rotation/state/rotation-session";
import { parseHomeSearch } from "#/lib/navigation/home-tabs";

import { Route as SignInCardRoute } from "./settings/sign-in-card";

const OLD = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;
const OLD_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function renderSettings() {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: parseHomeSearch,
    component: () => (
      <div>
        <h1>Settings</h1>
        <Link to="/settings/sign-in-card">Replace sign-in card</Link>
      </div>
    ),
  });
  // The real route's leave hook, on a page that only renders the Back control.
  const cardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings/sign-in-card",
    onLeave: (match) =>
      SignInCardRoute.options.onLeave?.(
        match as Parameters<NonNullable<typeof SignInCardRoute.options.onLeave>>[0],
      ),
    component: () => (
      <div>
        <h1>Card page</h1>
        <BackChevron label="Back to settings" to="/" search={{ tab: "settings" }} />
      </div>
    ),
  });
  const history = createMemoryHistory({ initialEntries: ["/?tab=settings"] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, cardRoute]),
    history,
  });
  render(<RouterProvider router={router} />);
  return history;
}

describe("sign-in card replacement history", () => {
  it("opens on its own entry, Back returns to Settings and drops both keys", async () => {
    const history = renderSettings();
    fireEvent.click(await screen.findByRole("link", { name: "Replace sign-in card" }));
    await screen.findByRole("heading", { name: "Card page" });
    expect(history.length).toBe(2);
    useRotationSession.getState().begin(OLD, { kind: "card", key: OLD_KEY });
    expect(useRotationSession.getState().newKey).not.toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Back to settings" }));

    await screen.findByRole("heading", { name: "Settings" });
    expect(history.location.pathname).toBe("/");
    expect(new URLSearchParams(history.location.search).get("tab")).toBe("settings");
    expect(useRotationSession.getState().newKey).toBeNull();
    expect(useRotationSession.getState().oldSigner).toBeNull();
  });
});
