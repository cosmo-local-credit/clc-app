import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const authListeners = vi.hoisted(() => new Set<() => void>());
const auth = vi.hoisted(() => ({
  version: 0,
  state: "authenticated" as
    | "authenticated"
    | "connectedNoSession"
    | "guest"
    | "loading"
    | "sessionCheckError",
  isLoading: false,
  isAuthenticated: true,
  address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
  session: {
    address: "0x1111111111111111111111111111111111111111",
  } as { address: string } | null | undefined,
}));

function setAuth(next: Partial<typeof auth>) {
  Object.assign(auth, next);
  auth.version += 1;
  for (const listener of authListeners) listener();
}

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => {
    useSyncExternalStore(
      (listener) => {
        authListeners.add(listener);
        return () => authListeners.delete(listener);
      },
      () => auth.version,
      () => auth.version,
    );
    return auth;
  },
}));

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: () => <svg data-testid="clc-logo" />,
}));

import { NavigationShell } from "./navigation-shell";

async function renderShell(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const navRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_nav",
    component: NavigationShell,
  });
  const homeRoute = createRoute({
    getParentRoute: () => navRoute,
    path: "/",
    staticData: { navOwner: "home" },
    component: () => (
      <>
        <h1>Home</h1>
        <Link to="/posts/$reportId" params={{ reportId: "report-1" }}>
          Open report
        </Link>
      </>
    ),
  });
  const reportRoute = createRoute({
    getParentRoute: () => navRoute,
    path: "/posts/$reportId",
    staticData: { navOwner: "posts" },
    component: () => <h1>Report</h1>,
  });
  const marketRoute = createRoute({
    getParentRoute: () => navRoute,
    path: "/market",
    staticData: { navOwner: "market" },
    component: () => <h1>Marketplace</h1>,
  });
  const poolRoute = createRoute({
    getParentRoute: () => navRoute,
    path: "/pools/$poolAddress",
    staticData: { navOwner: "wallet" },
    component: () => <h1>Pool</h1>,
  });
  const vouchersRoute = createRoute({
    getParentRoute: () => navRoute,
    path: "/wallet/vouchers",
    staticData: { navOwner: "wallet" },
    component: () => <h1>All vouchers</h1>,
  });
  const voucherRoute = createRoute({
    getParentRoute: () => navRoute,
    path: "/vouchers/$voucherAddress",
    staticData: { navOwner: "voucher" },
    component: () => <h1>Voucher</h1>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      navRoute.addChildren([
        homeRoute,
        marketRoute,
        reportRoute,
        poolRoute,
        vouchersRoute,
        voucherRoute,
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  await router.load();
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}

beforeEach(() => {
  setAuth({
    state: "authenticated",
    isLoading: false,
    isAuthenticated: true,
    address: "0x1111111111111111111111111111111111111111",
    session: { address: "0x1111111111111111111111111111111111111111" },
  });
});

describe("NavigationShell", () => {
  it("keeps Market selected while its button toggles between the map and All", async () => {
    const map = await renderShell("/");
    const mapLink = await screen.findByRole("link", { name: "Market" });
    expect(mapLink.getAttribute("href")).toBe("/market?scope=all");
    expect(mapLink.getAttribute("aria-current")).toBe("true");

    map.unmount();
    await renderShell("/market?scope=pools");
    const listLink = await screen.findByRole("link", { name: "Map" });
    expect(listLink.getAttribute("href")).toBe("/?tab=market&view=map");
    expect(listLink.getAttribute("aria-current")).toBe("true");
  });

  it("returns a list to the map while preserving shared market filters", async () => {
    const { router } = await renderShell("/market?scope=pools&q=food");

    const market = await screen.findByRole("link", { name: "Map" });
    fireEvent.click(market);

    await waitFor(() => expect(router.state.location.href).toBe("/?q=food&tab=market&view=map"));
  });

  it("treats filtered and voucher-sheet home states as the map", async () => {
    const address = `0x${"2".repeat(40)}`;
    const { router } = await renderShell(`/?tab=market&view=map&q=food&voucher=${address}`);

    const market = await screen.findByRole("link", { name: "Market" });
    expect(market.getAttribute("href")).toBe("/market?q=food&scope=all");
    fireEvent.click(market);

    await waitFor(() => expect(router.state.location.href).toBe("/market?q=food&scope=all"));
  });

  it("keeps Posts selected on an authenticated report", async () => {
    await renderShell("/posts/report-1");

    expect(await screen.findByRole("heading", { name: "Report" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Posts" }).getAttribute("aria-current")).toBe("true");
  });

  it.each([
    ["/pools/0x1111111111111111111111111111111111111111", "Wallet"],
    ["/wallet/vouchers", "Wallet"],
    ["/vouchers/0x2222222222222222222222222222222222222222?from=market", "Map"],
    ["/vouchers/0x2222222222222222222222222222222222222222?from=posts&reportId=report-1", "Posts"],
    ["/vouchers/0x2222222222222222222222222222222222222222?from=wallet", "Wallet"],
    [
      "/vouchers/0x2222222222222222222222222222222222222222?from=market&poolAddress=0x1111111111111111111111111111111111111111",
      "Wallet",
    ],
  ])("selects %s ownership through %s", async (initialEntry, label) => {
    await renderShell(initialEntry);

    expect((await screen.findByRole("link", { name: label })).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "Map" })).toBeTruthy();
    expect(screen.queryByTestId("clc-logo")).toBeNull();
  });

  it("keeps the Market logo when a Want sheet is open", async () => {
    await renderShell("/?tab=market&view=map&want=1");
    expect(await screen.findByRole("link", { name: "Market" })).toBeTruthy();
    expect(screen.getByTestId("clc-logo")).toBeTruthy();
  });

  it("does not parse a voucher posts tab as the Home Posts tab", async () => {
    await renderShell("/vouchers/0x2222222222222222222222222222222222222222?from=wallet&tab=posts");

    expect((await screen.findByRole("link", { name: "Wallet" })).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("aria-current")).toBeNull();
  });

  it.each(["/", "/vouchers/0x2222222222222222222222222222222222222222"])(
    "shows a resolved guest the navigation with the private tabs locked at %s",
    async (initialEntry) => {
      setAuth({
        state: "guest",
        isAuthenticated: false,
        address: undefined,
        session: undefined,
      });

      await renderShell(initialEntry);

      const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
      expect(navigation.querySelectorAll("a svg + svg")).toHaveLength(3);
      for (const label of ["Wallet", "Activity", "Settings"]) {
        expect(screen.getByRole("link", { name: label }).querySelectorAll("svg")).toHaveLength(2);
      }
      for (const label of ["Posts", initialEntry === "/" ? "Market" : "Map"]) {
        expect(screen.getByRole("link", { name: label }).querySelectorAll("svg")).toHaveLength(1);
      }
    },
  );

  it("reserves the navigation's clearance on every route, before auth resolves", async () => {
    setAuth({ state: "loading", isLoading: true, isAuthenticated: false, session: undefined });

    await renderShell("/");

    const home = await screen.findByRole("heading", { name: "Home" });
    expect(home.parentElement?.style.getPropertyValue("--bottom-nav-offset")).toBe(
      "calc(4rem + env(safe-area-inset-bottom))",
    );
    // No locks until the session is known, so a member never sees them flash.
    expect(screen.getByRole("link", { name: "Wallet" }).querySelectorAll("svg")).toHaveLength(1);
  });

  it("keeps the private tabs open during a session check error only for a matching cached session", async () => {
    setAuth({
      state: "sessionCheckError",
      isAuthenticated: false,
      session: { address: "0x1111111111111111111111111111111111111111" },
    });

    const { rerender, router } = await renderShell(
      "/vouchers/0x2222222222222222222222222222222222222222",
    );
    const wallet = await screen.findByRole("link", { name: "Wallet" });
    expect(wallet.querySelectorAll("svg")).toHaveLength(1);

    setAuth({ session: { address: "0x3333333333333333333333333333333333333333" } });
    rerender(<RouterProvider router={router} />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Wallet" }).querySelectorAll("svg")).toHaveLength(2),
    );
  });

  it("keeps the same navbar node mounted from a destination root to its descendant", async () => {
    const { router } = await renderShell("/?tab=posts");
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });

    fireEvent.click(screen.getByRole("link", { name: "Open report" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts/report-1"));

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBe(navigation);
  });

  it("keeps navigation and locks the private tabs after sign-out", async () => {
    const { rerender, router } = await renderShell(
      "/vouchers/0x2222222222222222222222222222222222222222",
    );
    expect(await screen.findByRole("navigation", { name: "Primary navigation" })).toBeTruthy();

    setAuth({
      state: "guest",
      isLoading: false,
      isAuthenticated: false,
      address: undefined,
      session: undefined,
    });
    rerender(<RouterProvider router={router} />);

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wallet" }).querySelectorAll("svg")).toHaveLength(2);
    expect(
      screen
        .getByRole("heading", { name: "Voucher" })
        .parentElement?.style.getPropertyValue("--bottom-nav-offset"),
    ).toBe("calc(4rem + env(safe-area-inset-bottom))");
  });
});
