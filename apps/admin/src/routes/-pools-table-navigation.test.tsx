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
import { parsePoolListSearch } from "#/features/pools/pool-list-search";

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

const getFilteredPools = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: { admin: { listPools: (...args: unknown[]) => getFilteredPools(...args) } },
}));

function renderPoolsRoute(initialEntry = "/pools") {
  const rootRoute = createRootRoute({ component: Outlet });
  const poolsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools",
    validateSearch: parsePoolListSearch,
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
    getFilteredPools.mockImplementation((params: { cursor?: number }) =>
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
    getFilteredPools.mockImplementation((params: { cursor?: number }) =>
      Promise.resolve(params.cursor === undefined ? PAGE_ONE : PAGE_TWO),
    );

    renderPoolsRoute("/pools?perPage=25&cursor=976&dir=next");
    // Landing directly on page two must request that page, not the first.
    await waitFor(() => expect(screen.getByText("Pool 975")).toBeTruthy());
    expect(getFilteredPools).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 976, next: true }),
      expect.anything(),
    );
  });

  it("requests the page size named in the URL, not a hard-coded one", async () => {
    getFilteredPools.mockResolvedValue(PAGE_ONE);

    renderPoolsRoute("/pools?perPage=50");
    await waitFor(() => expect(getFilteredPools).toHaveBeenCalled());
    expect(getFilteredPools).toHaveBeenCalledWith(
      expect.objectContaining({ perPage: 50 }),
      expect.anything(),
    );
  });

  it("clamps an unsupported page size instead of requesting it", async () => {
    getFilteredPools.mockResolvedValue(PAGE_ONE);

    renderPoolsRoute("/pools?perPage=100000");
    await waitFor(() => expect(getFilteredPools).toHaveBeenCalled());
    expect(getFilteredPools).toHaveBeenCalledWith(
      expect.objectContaining({ perPage: 25 }),
      expect.anything(),
    );
  });

  it("drops the cursor when sorting, so one page's order is not read as the resource's", async () => {
    getFilteredPools.mockImplementation((params: { cursor?: number }) =>
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

  it("sends a typed term to the backend rather than filtering the fetched page", async () => {
    // The regression this guards: searching used to filter the rows already on
    // screen, so a pool on page four could not be found from page one. The term
    // has to reach the endpoint for the result to describe every pool.
    getFilteredPools.mockImplementation((params: { filter: { term: string } }) =>
      Promise.resolve(params.filter.term === "" ? PAGE_ONE : PAGE_TWO),
    );

    const router = renderPoolsRoute();
    await waitFor(() => expect(screen.getByText("Pool 1000")).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox", { name: "Name, symbol, address" }), {
      target: { value: "Pool 975" },
    });

    // Committed after the debounce, not on the keystroke.
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "Pool 975" }));
    expect(getFilteredPools).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ term: "Pool 975" }) }),
      expect.anything(),
    );
    await waitFor(() => expect(screen.getByText("Pool 975")).toBeTruthy());
  });

  it("does not send a one-character term, which the endpoint answers 400 for", async () => {
    // clc-core's store.NewCatalogFilter rejects a term under two runes, so
    // forwarding one turns a half-typed search into an error block. The table
    // stays unfiltered until the term is long enough to send.
    getFilteredPools.mockResolvedValue(PAGE_ONE);

    const router = renderPoolsRoute();
    await waitFor(() => expect(screen.getByText("Pool 1000")).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox", { name: "Name, symbol, address" }), {
      target: { value: "P" },
    });

    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "P" }));
    expect(getFilteredPools).not.toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ term: "P" }) }),
      expect.anything(),
    );
    expect(screen.getByText("Pool 1000")).toBeTruthy();
  });

  it("drops the cursor when the term changes, so page four's cursor is not reused", async () => {
    getFilteredPools.mockImplementation((params: { cursor?: number }) =>
      Promise.resolve(params.cursor === undefined ? PAGE_ONE : PAGE_TWO),
    );

    const router = renderPoolsRoute("/pools?perPage=25&cursor=976&dir=next");
    await waitFor(() => expect(screen.getByText("Pool 975")).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox", { name: "Name, symbol, address" }), {
      target: { value: "market" },
    });

    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "market" }));
    expect(router.state.location.search).not.toHaveProperty("cursor");
  });

  it("lists name and symbol separately, without swap fee, unit, or tags", async () => {
    getFilteredPools.mockResolvedValue(PAGE_ONE);
    renderPoolsRoute();
    await waitFor(() => expect(screen.getByText("Pool 1000")).toBeTruthy());

    expect(screen.getByRole("columnheader", { name: /name/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /symbol/i })).toBeTruthy();
    expect(screen.getByText("P1000")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /swap fee/i })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /^unit$/i })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /^tags$/i })).toBeNull();
  });

  it("requests retired pools from the admin catalog and resets pagination", async () => {
    getFilteredPools.mockResolvedValue(PAGE_ONE);
    const router = renderPoolsRoute("/pools?cursor=976&dir=next");
    await screen.findByText("Pool 1000");
    fireEvent.click(screen.getByRole("button", { name: "retired" }));
    await waitFor(() =>
      expect(getFilteredPools).toHaveBeenCalledWith(
        expect.objectContaining({ status: "retired" }),
        expect.anything(),
      ),
    );
    expect(router.state.location.search).toMatchObject({ status: "retired" });
    expect(router.state.location.search).not.toHaveProperty("cursor");
  });
});
