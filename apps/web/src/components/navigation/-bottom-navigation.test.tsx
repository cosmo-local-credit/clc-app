import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
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
}: {
  initialEntry?: string;
  activeTab?: HomeTab;
  atActiveTabRoot?: boolean;
} = {}) {
  function NavigationFixture() {
    const search = useSearch({ strict: false });
    const selectedTab = activeTab ?? parseHomeTab(search.tab);
    return (
      <BottomNavigation
        activeTab={selectedTab}
        atActiveTabRoot={atActiveTabRoot ?? isAtHomeTabRoot(search)}
      />
    );
  }

  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search): { tab: HomeTab; view?: "list" } => ({
      tab: parseHomeTab(search.tab),
      view: search.view === "list" ? "list" : undefined,
    }),
    component: NavigationFixture,
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
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
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(`/?tab=${tab}`);
    }
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

  it("does not add history when the active tab is selected", async () => {
    const { history } = await renderNavigation({ initialEntry: "/" });
    const initialHref = history.location.href;
    const initialLength = history.length;

    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    expect(history.location.href).toBe(initialHref);
    expect(history.length).toBe(initialLength);
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

  it("returns the active Browse-all subview to the map and Back restores the list", async () => {
    const { history } = await renderNavigation({
      initialEntry: "/?tab=market&view=list",
      activeTab: "market",
      atActiveTabRoot: false,
    });
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    await waitFor(() => expect(history.location.href).toBe("/?tab=market"));

    await act(async () => {
      history.back();
    });

    await waitFor(() => expect(history.location.href).toBe("/?tab=market&view=list"));
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
