import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

vi.mock("#/components/app-menu", () => ({
  AppMenu: () => <button type="button">Open menu</button>,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, isLoading: false }),
}));

import { MarketBar } from "#/components/market-bar";
import {
  type MarketListScope,
  parseMarketplaceScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";

const filter = {
  term: "",
  setTerm: vi.fn(),
  clearTerm: vi.fn(),
} as unknown as CatalogFilterControls;

function Bar({ current }: { current: "map" | MarketListScope }) {
  return (
    <>
      <h1>{current}</h1>
      <MarketBar
        current={current}
        filter={filter}
        searchLabel="Search the marketplace"
        filters={null}
      />
    </>
  );
}

function renderMarket(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const mapRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: pickMarketplaceSearch,
    component: () => <Bar current="map" />,
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/market",
    validateSearch: pickMarketplaceSearch,
    component: function List() {
      const { scope } = listRoute.useSearch();
      return <Bar current={parseMarketplaceScope(scope) ?? "vouchers"} />;
    },
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([mapRoute, listRoute]),
    history,
  });
  render(<RouterProvider router={router} />);
  return history;
}

function query(history: { location: { search: string } }, key: string) {
  return new URLSearchParams(history.location.search).get(key);
}

async function back(history: { back: () => void }) {
  await act(async () => {
    history.back();
  });
}

describe("market badge navigation", () => {
  it("opens a list from the map, and Back returns to the map with the search", async () => {
    const history = renderMarket("/?q=bike");
    expect(await screen.findByRole("heading", { name: "map" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Pools" }));
    expect(await screen.findByRole("heading", { name: "pools" })).toBeTruthy();
    expect(history.location.pathname).toBe("/market");
    expect(query(history, "scope")).toBe("pools");
    expect(query(history, "q")).toBe("bike");

    await back(history);

    expect(await screen.findByRole("heading", { name: "map" })).toBeTruthy();
    expect(history.location.pathname).toBe("/");
    expect(query(history, "q")).toBe("bike");
  });

  it("renders Map as the final shared navigation destination", async () => {
    renderMarket("/market?scope=offers&q=bike");
    expect(await screen.findByRole("heading", { name: "offers" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("href")).toBe("/?q=bike");
  });

  it("returns to the map from the open list's badge", async () => {
    const history = renderMarket("/market?scope=catalogs");
    expect(await screen.findByRole("heading", { name: "catalogs" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Catalogs" }));

    expect(await screen.findByRole("heading", { name: "map" })).toBeTruthy();
    expect(history.location.pathname).toBe("/");
  });

  it("opens All from the map, its badge returns to the map, and Back reopens All", async () => {
    const history = renderMarket("/?q=bike");
    await screen.findByRole("heading", { name: "map" });

    fireEvent.click(screen.getByRole("link", { name: "All" }));
    expect(await screen.findByRole("heading", { name: "all" })).toBeTruthy();
    expect(history.location.pathname).toBe("/market");
    expect(query(history, "scope")).toBe("all");
    expect(query(history, "q")).toBe("bike");

    fireEvent.click(screen.getByRole("link", { name: "All" }));
    expect(await screen.findByRole("heading", { name: "map" })).toBeTruthy();
    expect(query(history, "q")).toBe("bike");

    await back(history);
    expect(await screen.findByRole("heading", { name: "all" })).toBeTruthy();
  });

  it("moves between lists through their badges, one entry each", async () => {
    const history = renderMarket("/");
    await screen.findByRole("heading", { name: "map" });

    fireEvent.click(screen.getByRole("link", { name: "Vouchers" }));
    await screen.findByRole("heading", { name: "vouchers" });
    fireEvent.click(screen.getByRole("link", { name: "Offers" }));
    await screen.findByRole("heading", { name: "offers" });

    await back(history);
    await waitFor(() => expect(query(history, "scope")).toBe("vouchers"));
    await back(history);
    expect(await screen.findByRole("heading", { name: "map" })).toBeTruthy();
  });
});
