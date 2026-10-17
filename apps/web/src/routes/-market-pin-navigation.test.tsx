import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { BackChevron } from "#/components/wallet/wallet-layout";
import { pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { parseHomeSearch } from "#/lib/navigation/home-tabs";
import { parseVoucherSheetSearch } from "#/lib/navigation/voucher-sheet-search";

const POOL = "0x49D3E72BECC7870Cd9d1981d5F4eC8e1CB5394E2";
const VOUCHER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// The market map's pins: the same navigation `MarketPage` makes on a tap. The
// history index is what the map keys its restored camera on.
function Market() {
  const navigate = useNavigate();
  const { voucher } = parseVoucherSheetSearch(useSearch({ strict: false }));
  const index = useRouterState({ select: (state) => state.location.state.__TSR_index });
  return (
    <div>
      <h1>Map</h1>
      <output data-testid="selected">{voucher ?? "none"}</output>
      <output data-testid="entry">{index}</output>
      <button
        type="button"
        onClick={() =>
          void navigate({
            to: "/vouchers/$voucherAddress",
            params: { voucherAddress: VOUCHER },
            search: { from: "market" },
          })
        }
      >
        Voucher pin
      </button>
      <button
        type="button"
        onClick={() => void navigate({ to: "/pools/$poolAddress", params: { poolAddress: POOL } })}
      >
        Pool pin
      </button>
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
  const voucherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/$voucherAddress",
    validateSearch: (search) => ({ from: search.from === "market" ? "market" : undefined }),
    component: () => (
      <div>
        <h1>Voucher</h1>
        <BackChevron label="Market" to="/" />
      </div>
    ),
  });
  const poolRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress",
    component: () => (
      <div>
        <h1>Pool</h1>
        <BackChevron label="Pools" to="/market" search={{ scope: "pools" }} />
      </div>
    ),
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, voucherRoute, poolRoute]),
    history,
  });
  render(<RouterProvider router={router} />);
  return history;
}

describe("market pin navigation", () => {
  it("opens a voucher on its own page from the market, and Back returns to the same map", async () => {
    const history = renderMarket("/");
    await screen.findByRole("heading", { name: "Map" });
    const entry = screen.getByTestId("entry").textContent;

    fireEvent.click(screen.getByRole("button", { name: "Voucher pin" }));

    await screen.findByRole("heading", { name: "Voucher" });
    expect(history.location.pathname).toBe(`/vouchers/${VOUCHER}`);
    expect(new URLSearchParams(history.location.search).get("from")).toBe("market");

    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    await screen.findByRole("heading", { name: "Map" });
    expect(history.location.pathname).toBe("/");
    // The same entry, so the map gives back the camera it left.
    expect(screen.getByTestId("entry").textContent).toBe(entry);
  });

  it("opens a pool on its own page, and Back returns to the map", async () => {
    const history = renderMarket("/");
    await screen.findByRole("heading", { name: "Map" });

    fireEvent.click(screen.getByRole("button", { name: "Pool pin" }));
    await screen.findByRole("heading", { name: "Pool" });
    expect(history.location.pathname).toBe(`/pools/${POOL}`);
    expect(history.length).toBe(2);

    await act(async () => {
      history.back();
    });

    await screen.findByRole("heading", { name: "Map" });
    expect(history.location.pathname).toBe("/");
  });

  it("keeps a linked voucher's pin selected after its page and Back", async () => {
    renderMarket(`/?voucher=${VOUCHER}`);
    expect((await screen.findByTestId("selected")).textContent).toBe(VOUCHER);

    fireEvent.click(screen.getByRole("button", { name: "Voucher pin" }));
    await screen.findByRole("heading", { name: "Voucher" });
    fireEvent.click(screen.getByRole("link", { name: "Market" }));

    expect((await screen.findByTestId("selected")).textContent).toBe(VOUCHER);
  });
});
