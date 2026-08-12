import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import { PoolsPage } from "#/features/pools/pools-page";
import { parseTableSearch } from "#/lib/table-search";

/**
 * The table's state lives in the URL so Back returns an operator to the page they
 * were reading. A table that silently resets to page one on Back is worse than
 * one that never paged, so the history behaviour is pinned here rather than left
 * to the pagination unit tests.
 */
const PAGE_ONE = { pools: [pool(1000)], first: 1000, last: 976, receivedCount: 25 };
const PAGE_TWO = { pools: [pool(975)], first: 975, last: 951, receivedCount: 25 };

function pool(id: number) {
  return {
    id: String(id),
    address: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Pool ${id}`,
    symbol: `P${id}`,
    tags: [],
    voucherCount: 0,
    feePpm: null,
    unitOfAccount: null,
    locationName: null,
    chainId: 42220,
    ownerAddress: null,
    decimals: 6,
  };
}

const getPools = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: { pools: { getPools: (...args: unknown[]) => getPools(...args) } },
}));

function renderPoolsRoute(initialEntry = "/pools") {
  const rootRoute = createRootRoute({ component: Outlet });
  const poolsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools",
    validateSearch: parseTableSearch,
    component: function PoolsRoute() {
      return <PoolsPage search={poolsRoute.useSearch()} />;
    },
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$address",
    component: () => <p>detail</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([poolsRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("pools table navigation", () => {
  it("records the cursor in the URL and returns to the first page on Back", async () => {
    getPools.mockImplementation((params: { cursor?: number }) =>
      Promise.resolve(params.cursor === undefined ? PAGE_ONE : PAGE_TWO),
    );

    const router = renderPoolsRoute();
    await waitFor(() => expect(screen.getByText("Pool 1000")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getByText("Pool 975")).toBeTruthy());
    expect(router.state.location.search).toMatchObject({ cursor: 976, dir: "next" });

    act(() => {
      router.history.back();
    });
    await waitFor(() => expect(screen.getByText("Pool 1000")).toBeTruthy());
    expect(router.state.location.search).not.toHaveProperty("cursor");
  });

  it("restores the exact page from a pasted URL", async () => {
    getPools.mockImplementation((params: { cursor?: number }) =>
      Promise.resolve(params.cursor === undefined ? PAGE_ONE : PAGE_TWO),
    );

    renderPoolsRoute("/pools?perPage=25&cursor=976&dir=next");
    // Landing directly on page two must request that page, not the first.
    await waitFor(() => expect(screen.getByText("Pool 975")).toBeTruthy());
    expect(getPools).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 976, next: true }),
      expect.anything(),
    );
  });

  it("requests the page size named in the URL, not a hard-coded one", async () => {
    getPools.mockResolvedValue(PAGE_ONE);

    renderPoolsRoute("/pools?perPage=50");
    await waitFor(() => expect(getPools).toHaveBeenCalled());
    expect(getPools).toHaveBeenCalledWith(
      expect.objectContaining({ perPage: 50 }),
      expect.anything(),
    );
  });

  it("clamps an unsupported page size instead of requesting it", async () => {
    getPools.mockResolvedValue(PAGE_ONE);

    renderPoolsRoute("/pools?perPage=100000");
    await waitFor(() => expect(getPools).toHaveBeenCalled());
    expect(getPools).toHaveBeenCalledWith(
      expect.objectContaining({ perPage: 25 }),
      expect.anything(),
    );
  });

  it("drops the cursor when sorting, so one page's order is not read as the resource's", async () => {
    getPools.mockImplementation((params: { cursor?: number }) =>
      Promise.resolve(params.cursor === undefined ? PAGE_ONE : PAGE_TWO),
    );

    const router = renderPoolsRoute("/pools?perPage=25&cursor=976&dir=next");
    await waitFor(() => expect(screen.getByText("Pool 975")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /vouchers/i }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ sort: "voucherCount" }),
    );
    expect(router.state.location.search).not.toHaveProperty("cursor");
  });
});
