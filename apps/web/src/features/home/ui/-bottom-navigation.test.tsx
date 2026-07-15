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
import { type HomeTab, parseHomeTab } from "./tabs";

const LABELS: Record<HomeTab, string> = {
  wallet: "Wallet",
  activity: "Activity",
  market: "Market",
  pool: "Pools",
  settings: "Settings",
};

async function renderNavigation({
  initialEntry = "/?tab=wallet",
  isAuthenticated = true,
}: {
  initialEntry?: string;
  isAuthenticated?: boolean;
} = {}) {
  function NavigationFixture() {
    const search = useSearch({ strict: false });
    return (
      <BottomNavigation activeTab={parseHomeTab(search.tab)} isAuthenticated={isAuthenticated} />
    );
  }

  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search): { tab: HomeTab } => ({
      tab: parseHomeTab(search.tab),
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
    await renderNavigation({ initialEntry: "/?tab=pool" });

    for (const [tab, label] of Object.entries(LABELS) as [HomeTab, string][]) {
      const link = screen.getByRole("link", { name: label });
      if (tab === "pool") {
        expect(link.getAttribute("aria-current")).toBe("page");
      } else {
        expect(link.getAttribute("aria-current")).toBeNull();
      }
    }
  });

  it("renders only the market link for guests", async () => {
    await renderNavigation({ initialEntry: "/?tab=market", isAuthenticated: false });

    expect(screen.getByRole("link", { name: "Market" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Wallet" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Pools" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("does not add history when the active tab is selected", async () => {
    const { history } = await renderNavigation({ initialEntry: "/" });
    const initialHref = history.location.href;
    const initialLength = history.length;

    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    expect(history.location.href).toBe(initialHref);
    expect(history.length).toBe(initialLength);
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
