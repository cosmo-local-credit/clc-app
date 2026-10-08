import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { BackChevron } from "#/components/wallet/wallet-layout";
import { pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { parseHomeSearch } from "#/lib/navigation/home-tabs";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";

const POOL = "0x49D3E72BECC7870Cd9d1981d5F4eC8e1CB5394E2";
const VOUCHER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// The market map's pool pin: the same navigation `MarketPage` makes on a tap.
function Market() {
  const navigate = useNavigate();
  const { voucher } = useVoucherSheetSelection();
  return (
    <div>
      <output data-testid="card">{voucher ?? "none"}</output>
      <button
        type="button"
        onClick={() => void navigate({ to: "/pools/$poolAddress", params: { poolAddress: POOL } })}
      >
        Pool pin
      </button>
    </div>
  );
}

function Pool() {
  return (
    <div>
      <h1>Pool</h1>
      <BackChevron label="Pools" to="/pools" />
    </div>
  );
}

function renderMarket(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search) => ({ ...parseHomeSearch(search), ...pickCatalogSearch(search) }),
    component: Market,
  });
  const poolsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools",
    component: () => <h1>All pools</h1>,
  });
  const poolRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress",
    component: Pool,
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, poolsRoute, poolRoute]),
    history,
  });
  render(<RouterProvider router={router} />);
  return history;
}

describe("market pool pin history", () => {
  it("opens the pool on its own entry, and Back returns to the map", async () => {
    const history = renderMarket("/?tab=market");
    fireEvent.click(await screen.findByRole("button", { name: "Pool pin" }));

    await screen.findByRole("heading", { name: "Pool" });
    expect(history.location.pathname).toBe(`/pools/${POOL}`);
    expect(history.length).toBe(2);

    fireEvent.click(screen.getByRole("link", { name: "Pools" }));

    await screen.findByTestId("card");
    expect(history.location.pathname).toBe("/");
    expect(new URLSearchParams(history.location.search).get("tab")).toBe("market");
  });

  it("returns to the voucher card that was open when the pool was tapped", async () => {
    const history = renderMarket(`/?tab=market&voucher=${VOUCHER}`);
    expect((await screen.findByTestId("card")).textContent).toBe(VOUCHER);

    fireEvent.click(screen.getByRole("button", { name: "Pool pin" }));
    await screen.findByRole("heading", { name: "Pool" });
    fireEvent.click(screen.getByRole("link", { name: "Pools" }));

    await waitFor(() => expect(screen.getByTestId("card").textContent).toBe(VOUCHER));
    expect(history.location.pathname).toBe("/");
  });
});
