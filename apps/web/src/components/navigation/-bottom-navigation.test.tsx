import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
  useSearch,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/ui/clc-logo", () => ({
  CLCLogo: () => <svg data-testid="clc-logo" />,
}));

import { BottomNavigation } from "./bottom-navigation";
import { type HomeTab, isAtHomeTabRoot, parseHomeTab } from "#/lib/navigation/home-tabs";

const LABELS: Record<HomeTab, string> = {
  wallet: "Wallet",
  activity: "Activity",
  market: "Market",
  posts: "Posts",
  settings: "Settings",
};

async function renderNavigation({
  initialEntry = "/?tab=wallet",
  activeTab,
  atActiveTabRoot,
  locked,
}: {
  initialEntry?: string;
  activeTab?: HomeTab;
  atActiveTabRoot?: boolean;
  locked?: boolean;
} = {}) {
  function NavigationFixture() {
    const search = useSearch({ strict: false });
    const location = useLocation();
    const selectedTab =
      activeTab ?? (location.pathname === "/market" ? "market" : parseHomeTab(search.tab));
    const selectedAtRoot =
      atActiveTabRoot ?? (location.pathname === "/market" ? false : isAtHomeTabRoot(search));
    return (
      <BottomNavigation activeTab={selectedTab} atActiveTabRoot={selectedAtRoot} locked={locked} />
    );
  }

  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search): { tab: HomeTab; q?: string } => ({
      tab: parseHomeTab(search.tab),
      q: typeof search.q === "string" ? search.q : undefined,
    }),
    component: NavigationFixture,
  });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/market",
    component: NavigationFixture,
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, marketRoute]),
    history,
  });

  await router.load();
  const result = render(<RouterProvider router={router} />);
  await screen.findByRole("navigation", { name: "Primary navigation" });

  return { ...result, history };
}

describe("BottomNavigation", () => {
  it("renders all five navigation links with typed search-param hrefs", async () => {
    await renderNavigation();

    for (const [tab, label] of Object.entries(LABELS) as [HomeTab, string][]) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(
        tab === "market" ? "/" : `/?tab=${tab}`,
      );
    }
  });

  it("locks Wallet, Activity and Settings for a guest and keeps their destinations", async () => {
    const { history } = await renderNavigation({ initialEntry: "/?tab=market", locked: true });

    for (const [tab, label] of Object.entries(LABELS) as [HomeTab, string][]) {
      const link = screen.getByRole("link", { name: label });
      const locks = tab === "wallet" || tab === "activity" || tab === "settings" ? 2 : 1;
      expect(link.querySelectorAll("svg")).toHaveLength(locks);
    }

    fireEvent.click(screen.getByRole("link", { name: "Wallet" }));
    await waitFor(() => expect(history.location.href).toBe("/?tab=wallet"));
  });

  it("only marks the active tab with aria-current='page'", async () => {
    await renderNavigation({ initialEntry: "/?tab=posts" });

    for (const [tab, label] of Object.entries(LABELS) as [HomeTab, string][]) {
      const link = screen.getByRole("link", { name: label });
      if (tab === "posts") {
        expect(link.getAttribute("aria-current")).toBe("page");
      } else {
        expect(link.getAttribute("aria-current")).toBeNull();
      }
    }
  });

  it("does nothing on the unfiltered map, the Market root", async () => {
    const { history } = await renderNavigation({ initialEntry: "/" });
    const market = screen.getByRole("link", { name: "Market" });
    expect(market.getAttribute("aria-current")).toBe("page");

    fireEvent.click(market);

    expect(history.location.pathname).toBe("/");
    expect(history.length).toBe(1);
  });

  it("returns a filtered map to the unfiltered map", async () => {
    const { history } = await renderNavigation({ initialEntry: "/?q=bike" });
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    await waitFor(() => expect(history.location.search).not.toContain("q="));
    expect(history.location.pathname).toBe("/");
    expect(history.length).toBe(2);
  });

  it("marks an active descendant and navigates it to the owning root", async () => {
    const { history } = await renderNavigation({
      initialEntry: "/?tab=market",
      activeTab: "wallet",
      atActiveTabRoot: false,
    });
    const walletLink = screen.getByRole("link", { name: "Wallet" });

    expect(walletLink.getAttribute("aria-current")).toBe("true");
    fireEvent.click(walletLink);

    await waitFor(() => expect(history.location.href).toBe("/?tab=wallet"));
  });

  it("returns a list to the map, and Back reopens the list", async () => {
    const { history } = await renderNavigation({
      initialEntry: "/market?scope=pools",
      activeTab: "market",
      atActiveTabRoot: false,
    });
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    await waitFor(() => expect(history.location.pathname).toBe("/"));

    await act(async () => {
      history.back();
    });

    await waitFor(() => expect(history.location.href).toBe("/market?scope=pools"));
  });

  it("restores the previous tab when navigating back", async () => {
    const { history } = await renderNavigation();

    fireEvent.click(screen.getByRole("link", { name: "Activity" }));
    await waitFor(() => expect(history.location.href).toBe("/?tab=activity"));

    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    await waitFor(() => expect(history.location.href).toBe("/?tab=settings"));

    await act(async () => {
      history.back();
    });

    await waitFor(() => {
      expect(history.location.href).toBe("/?tab=activity");
      expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBe(
        "page",
      );
    });
  });
});
