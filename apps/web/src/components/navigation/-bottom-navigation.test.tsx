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
import {
  type HomeTab,
  isAtHomeTabRoot,
  parseHomeTab,
  parseMarketView,
} from "#/lib/navigation/home-tabs";
import { pickMarketplaceSearch } from "#/lib/navigation/marketplace-search";

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
    const isMarketMap =
      location.pathname === "/" &&
      parseHomeTab(search.tab) === "market" &&
      parseMarketView(search.view) === "map";
    return (
      <BottomNavigation
        activeTab={selectedTab}
        atActiveTabRoot={selectedAtRoot}
        isMarketMap={isMarketMap}
        locked={locked}
      />
    );
  }

  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search) => ({
      tab: parseHomeTab(search.tab),
      view: search.view === "map" || search.view === "list" ? search.view : undefined,
      voucher: typeof search.voucher === "string" ? search.voucher : undefined,
      ...pickMarketplaceSearch(search),
    }),
    component: NavigationFixture,
  });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/market",
    validateSearch: pickMarketplaceSearch,
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
      expect(
        screen.getByRole("link", { name: tab === "market" ? "Map" : label }).getAttribute("href"),
      ).toBe(tab === "market" ? "/?tab=market&view=map" : `/?tab=${tab}`);
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
      const link = screen.getByRole("link", { name: tab === "market" ? "Map" : label });
      if (tab === "posts") {
        expect(link.getAttribute("aria-current")).toBe("page");
      } else {
        expect(link.getAttribute("aria-current")).toBeNull();
      }
    }
  });

  it("opens All from the unfiltered map with a normal history entry", async () => {
    const { history } = await renderNavigation({ initialEntry: "/" });
    const market = screen.getByRole("link", { name: "Market" });
    expect(market.getAttribute("href")).toBe("/market?scope=all");
    expect(market.getAttribute("aria-current")).toBe("true");

    fireEvent.click(market);

    await waitFor(() => expect(history.location.href).toBe("/market?scope=all"));
    expect(history.length).toBe(2);
  });

  it("opens All from a filtered map while retaining only canonical shared filters", async () => {
    const address = `0x${"a".repeat(40)}`;
    const { history } = await renderNavigation({
      initialEntry: `/?tab=market&view=map&q=bike&tags=Repair&creditable=true&out_voucher=${address}&voucher=${address}`,
    });
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    await waitFor(() => expect(history.location.pathname).toBe("/market"));
    expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({
      q: "bike",
      tags: "Repair",
      creditable: "true",
      scope: "all",
    });
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

  it("returns a list to the map with shared filters, and Back reopens the list", async () => {
    const { history } = await renderNavigation({
      initialEntry: `/market?scope=pools&q=food&tags=Repair&creditable=true&out_voucher=0x${"a".repeat(40)}`,
      activeTab: "market",
      atActiveTabRoot: false,
    });
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("link", { name: "Map" }));

    await waitFor(() => expect(history.location.pathname).toBe("/"));
    expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({
      q: "food",
      tags: "Repair",
      creditable: "true",
      tab: "market",
      view: "map",
    });

    await act(async () => {
      history.back();
    });

    await waitFor(() => expect(history.location.pathname).toBe("/market"));
    expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({
      scope: "pools",
      q: "food",
      tags: "Repair",
      creditable: "true",
      out_voucher: `0x${"a".repeat(40)}`,
    });
  });

  it("opens a clean map from another bottom tab", async () => {
    const { history } = await renderNavigation({ initialEntry: "/?tab=posts" });

    fireEvent.click(screen.getByRole("link", { name: "Map" }));

    await waitFor(() => expect(history.location.href).toBe("/?tab=market&view=map"));
  });

  it.each([
    "/?tab=wallet&view=map",
    "/?tab=settings&view=map",
    "/?tab=activity&view=map",
    "/?tab=posts&view=map",
    "/market",
    "/market?scope=all",
    "/market?scope=offers",
    "/market?scope=wants",
    "/market?scope=vouchers",
    "/market?scope=pools",
    "/market?scope=catalogs",
  ])("shows the Map glyph and label away from the map: %s", async (initialEntry) => {
    await renderNavigation({ initialEntry });
    const map = screen.getByRole("link", { name: "Map" });
    expect(map.getAttribute("href")).toBe("/?tab=market&view=map");
    expect(screen.queryByTestId("clc-logo")).toBeNull();
    expect(map.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("switches logo and label with navigation and restores them with Back", async () => {
    const { history } = await renderNavigation({ initialEntry: "/?tab=market&view=map" });
    expect(screen.getByTestId("clc-logo")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Market" }));
    await screen.findByRole("link", { name: "Map" });
    expect(screen.queryByTestId("clc-logo")).toBeNull();
    await act(async () => history.back());
    await screen.findByRole("link", { name: "Market" });
    expect(screen.getByTestId("clc-logo")).toBeTruthy();
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
