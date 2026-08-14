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
      navRoute.addChildren([homeRoute, reportRoute, poolRoute, vouchersRoute, voucherRoute]),
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
  it("keeps Posts selected on an authenticated report", async () => {
    await renderShell("/posts/report-1");

    expect(await screen.findByRole("heading", { name: "Report" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Posts" }).getAttribute("aria-current")).toBe("true");
  });

  it.each([
    ["/pools/0x1111111111111111111111111111111111111111", "Wallet"],
    ["/wallet/vouchers", "Wallet"],
    ["/vouchers/0x2222222222222222222222222222222222222222?from=market", "Market"],
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
  });

  it("does not parse a voucher posts tab as the Home Posts tab", async () => {
    await renderShell("/vouchers/0x2222222222222222222222222222222222222222?from=wallet&tab=posts");

    expect((await screen.findByRole("link", { name: "Wallet" })).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("aria-current")).toBeNull();
  });

  it.each(["/", "/vouchers/0x2222222222222222222222222222222222222222"])(
    "renders no primary navigation for a resolved guest at %s",
    async (initialEntry) => {
      setAuth({
        state: "guest",
        isAuthenticated: false,
        address: undefined,
        session: undefined,
      });

      await renderShell(initialEntry);

      expect(await screen.findByRole("heading")).toBeTruthy();
      expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
    },
  );

  it("reserves voucher clearance while authentication is loading without showing a landmark", async () => {
    setAuth({ state: "loading", isLoading: true, isAuthenticated: false, session: undefined });

    await renderShell("/vouchers/0x2222222222222222222222222222222222222222");

    const voucher = await screen.findByRole("heading", { name: "Voucher" });
    expect(voucher.parentElement?.style.getPropertyValue("--bottom-nav-offset")).toBe(
      "calc(4rem + env(safe-area-inset-bottom))",
    );
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
  });

  it("does not reserve pending clearance on non-voucher routes", async () => {
    setAuth({ state: "loading", isLoading: true, isAuthenticated: false, session: undefined });

    await renderShell("/");

    const home = await screen.findByRole("heading", { name: "Home" });
    expect(home.parentElement?.style.getPropertyValue("--bottom-nav-offset")).toBe("0px");
  });

  it("keeps navigation during a session check error only for a matching cached session", async () => {
    setAuth({
      state: "sessionCheckError",
      isAuthenticated: false,
      session: { address: "0x1111111111111111111111111111111111111111" },
    });

    const { rerender, router } = await renderShell(
      "/vouchers/0x2222222222222222222222222222222222222222",
    );
    expect(await screen.findByRole("navigation", { name: "Primary navigation" })).toBeTruthy();

    setAuth({ session: { address: "0x3333333333333333333333333333333333333333" } });
    rerender(<RouterProvider router={router} />);

    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull(),
    );
  });

  it("keeps the same navbar node mounted from a destination root to its descendant", async () => {
    const { router } = await renderShell("/?tab=posts");
    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });

    fireEvent.click(screen.getByRole("link", { name: "Open report" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts/report-1"));

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBe(navigation);
  });

  it("removes navigation and its offset after sign-out", async () => {
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

    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
    expect(
      screen
        .getByRole("heading", { name: "Voucher" })
        .parentElement?.style.getPropertyValue("--bottom-nav-offset"),
    ).toBe("0px");
  });
});
