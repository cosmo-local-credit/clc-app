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

import type { AuthStatus } from "#/features/auth/hooks/use-auth-status";
import { pickMarketplaceSearch } from "#/lib/navigation/marketplace-search";
import { parseOnboardingSearch } from "#/lib/onboarding-search";
import { MarketEmptyMessage } from "./market-empty-message";

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  state: "guest" as AuthStatus["state"],
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => auth }));

async function showMessage(surface: "map" | "list" = "list") {
  const initial =
    "/market?scope=pools&q=food&tags=Repair&creditable=true&out_voucher=0x1111111111111111111111111111111111111111";
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search) => ({
      ...pickMarketplaceSearch(search),
      tab: search.tab,
      view: search.view,
    }),
    component: () => <h1>Home</h1>,
  });
  const market = createRoute({
    getParentRoute: () => root,
    path: "/market",
    validateSearch: pickMarketplaceSearch,
    component: () => (
      <p>
        <MarketEmptyMessage surface={surface} />
      </p>
    ),
  });
  const onboarding = createRoute({
    getParentRoute: () => root,
    path: "/onboarding",
    validateSearch: parseOnboardingSearch,
    component: () => <h1>Sign in</h1>,
  });
  const history = createMemoryHistory({ initialEntries: [initial] });
  const router = createRouter({ routeTree: root.addChildren([home, market, onboarding]), history });
  await router.load();
  render(<RouterProvider router={router} />);
  return { history, initial };
}

beforeEach(() => {
  Object.assign(auth, { isAuthenticated: false, isLoading: false, state: "guest" });
});

describe("empty marketplace guidance", () => {
  it.each(["map", "list"] as const)(
    "links signed-in users to their Wallet on %s",
    async (surface) => {
      Object.assign(auth, { isAuthenticated: true, state: "authenticated" });
      const { history } = await showMessage(surface);
      const wallet = await screen.findByRole("link", { name: "Wallet" });
      expect(wallet.getAttribute("href")).toBe("/?tab=wallet");
      expect(wallet.closest("p")?.textContent).toBe(
        "No marketplace results to show yet, visit your Wallet to list a resource in this location.",
      );
      expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
      fireEvent.click(wallet);
      await waitFor(() => expect(history.location.href).toBe("/?tab=wallet"));
    },
  );

  it.each(["map", "list"] as const)(
    "links guests directly to sign-in with a Wallet return on %s",
    async (surface) => {
      const { history } = await showMessage(surface);
      const signin = await screen.findByRole("link", { name: "Sign in" });
      expect(signin.closest("p")?.textContent).toBe(
        "No marketplace results to show yet, Sign in to list a resource in this location.",
      );
      fireEvent.click(signin);
      await waitFor(() => expect(history.location.pathname).toBe("/onboarding"));
      expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({
        step: "signin",
        redirect: "/?tab=wallet",
      });
    },
  );

  it("returns a list to the map with compatible filters and supports Back", async () => {
    const { history, initial } = await showMessage();
    const location = await screen.findByRole("link", { name: "View this location on the map" });
    expect(location.textContent).toBe("location");
    expect(location.className).toContain("focus-visible:outline");
    fireEvent.click(location);
    await waitFor(() => expect(history.location.pathname).toBe("/"));
    expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({
      q: "food",
      tags: "Repair",
      creditable: "true",
      tab: "market",
      view: "map",
    });
    expect(history.length).toBe(2);
    await act(async () => history.back());
    await waitFor(() => expect(history.location.href).toBe(initial));
  });

  it("keeps the map location word as ordinary text", async () => {
    await showMessage("map");
    await screen.findByRole("link", { name: "Sign in" });
    expect(screen.queryByRole("link", { name: "View this location on the map" })).toBeNull();
  });

  it.each(["loading", "sessionCheckError"] as const)(
    "shows base copy while authentication is %s",
    async (state) => {
      Object.assign(auth, { state, isLoading: state === "loading" });
      await showMessage();
      await screen.findByText("No marketplace results to show yet.");
      expect(screen.queryByRole("link")).toBeNull();
    },
  );

  it("treats an expired session as needing sign-in", async () => {
    auth.state = "connectedNoSession";
    await showMessage();
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
  });
});
