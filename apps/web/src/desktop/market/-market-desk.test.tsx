import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { parseMarketplaceScope, pickMarketplaceSearch } from "#/lib/navigation/marketplace-search";

// The two views stand in for the real desks, but remember the view they show as the real ones do.
vi.mock("#/desktop/market/market-map-desk", async () => {
  const { useRememberMarketView } = await import("./market-view");
  return {
    MarketMapDesk: ({ scope }: { scope?: string }) => {
      useRememberMarketView("map");
      return <p data-testid="view">map:{scope}</p>;
    },
  };
});
vi.mock("#/desktop/market/market-list-desk", async () => {
  const { useRememberMarketView } = await import("./market-view");
  return {
    MarketListDesk: ({ scope }: { scope: string }) => {
      useRememberMarketView("list");
      return <p data-testid="view">list:{scope}</p>;
    },
  };
});

import { MarketDesk } from "./market-desk";
import { MARKET_VIEW_STORAGE_KEY, resolveMarketView } from "./market-view";

function renderMarket(url: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {/* Resource destinations are always their full-page lists. */}
        <Link to="/market" search={{ scope: "vouchers", view: "list" }}>
          Sidebar Vouchers
        </Link>
        <Link to="/market" search={{ scope: "wants", view: "list" }}>
          Sidebar Wants
        </Link>
        <Link to="/market" search={{ scope: "wants", view: "list" }}>
          Segment List
        </Link>
        <Link to="/market" search={{ scope: "all", view: "map" }}>
          Segment Map
        </Link>
        <Outlet />
      </>
    ),
  });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/market",
    validateSearch: (search: Record<string, unknown>) => ({
      ...pickMarketplaceSearch(search),
      view: search.view === "map" || search.view === "list" ? search.view : undefined,
    }),
    component: function Market() {
      const search = useSearch({ strict: false }) as ReturnType<typeof pickMarketplaceSearch> & {
        view?: "map" | "list";
      };
      return (
        <Suspense fallback={null}>
          <MarketDesk
            scope={parseMarketplaceScope(search.scope)}
            urlView={search.view}
            isAuthenticated={false}
            locationOwner="guest"
          />
        </Suspense>
      );
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([marketRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
});

describe("resolveMarketView", () => {
  it("prefers the URL, then the last view used, and defaults to the map only for a first visit", () => {
    expect(resolveMarketView(undefined)).toBe("map");
    window.localStorage.setItem(MARKET_VIEW_STORAGE_KEY, "list");
    expect(resolveMarketView(undefined)).toBe("list");
    expect(resolveMarketView("map")).toBe("map");
    window.localStorage.setItem(MARKET_VIEW_STORAGE_KEY, "nonsense");
    expect(resolveMarketView(undefined)).toBe("map");
  });
});

describe("MarketDesk", () => {
  it("opens the map on a first visit and writes the view into the URL", async () => {
    const router = renderMarket("/market?scope=wants");
    expect((await screen.findByTestId("view")).textContent).toBe("map:");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: "map" }));
    expect(router.state.location.search).toMatchObject({ scope: "wants" });
  });

  it("keeps resource destinations in List view across scope changes", async () => {
    const router = renderMarket("/market?scope=wants");
    await screen.findByTestId("view");

    fireEvent.click(screen.getByRole("link", { name: "Segment List" }));
    await waitFor(() => expect(screen.getByTestId("view").textContent).toBe("list:wants"));

    // Every resource link names its full-page list explicitly.
    fireEvent.click(screen.getByRole("link", { name: "Sidebar Vouchers" }));
    await waitFor(() => expect(screen.getByTestId("view").textContent).toBe("list:vouchers"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: "list" }));
    expect(window.localStorage.getItem(MARKET_VIEW_STORAGE_KEY)).toBe("list");
  });

  it("uses one unified Map and sends resource links back to their lists", async () => {
    renderMarket("/market?scope=wants&view=list");
    expect((await screen.findByTestId("view")).textContent).toBe("list:wants");

    fireEvent.click(screen.getByRole("link", { name: "Segment Map" }));
    await waitFor(() => expect(screen.getByTestId("view").textContent).toBe("map:"));

    fireEvent.click(screen.getByRole("link", { name: "Sidebar Vouchers" }));
    await waitFor(() => expect(screen.getByTestId("view").textContent).toBe("list:vouchers"));
  });

  it("opens in the remembered view on a later visit with no view in the link", async () => {
    window.localStorage.setItem(MARKET_VIEW_STORAGE_KEY, "list");
    const router = renderMarket("/market?scope=pools");
    expect((await screen.findByTestId("view")).textContent).toBe("list:pools");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: "list" }));
  });

  it("lets an explicit view in the link win over the remembered one", async () => {
    window.localStorage.setItem(MARKET_VIEW_STORAGE_KEY, "list");
    renderMarket("/market?scope=pools&view=map");
    expect((await screen.findByTestId("view")).textContent).toBe("map:");
  });
});
