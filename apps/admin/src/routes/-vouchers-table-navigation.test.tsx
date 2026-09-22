import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { VouchersPage } from "#/features/vouchers/vouchers-page";
import { parseVoucherListSearch } from "#/features/vouchers/voucher-list-search";

const PAGE = {
  vouchers: [voucher(1000)],
  first: 1000,
  last: 976,
  receivedCount: 25,
};

function voucher(id: number) {
  return {
    id: String(id),
    address: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Voucher ${id}`,
    symbol: `V${id}`,
    chainId: 42220,
    iconUrl: null,
    locationName: "Kilifi",
    lat: -3.51,
    lng: 39.91,
    kind: "goods" as const,
    active: true,
  };
}

const listVouchers = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    admin: {
      listVouchers: (...args: unknown[]) => listVouchers(...args),
    },
  },
}));

function renderVouchersRoute(initialEntry = "/vouchers") {
  const rootRoute = createRootRoute({ component: Outlet });
  const vouchersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers",
    validateSearch: parseVoucherListSearch,
    component: function VouchersRoute() {
      return <VouchersPage search={vouchersRoute.useSearch()} />;
    },
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/$address",
    component: () => <p>detail</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([vouchersRoute, detailRoute]),
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

describe("vouchers table", () => {
  beforeEach(() => {
    listVouchers.mockReset();
  });

  it("lists name and symbol as their own columns, without kind, chain, or kind tabs", async () => {
    listVouchers.mockResolvedValue(PAGE);
    renderVouchersRoute();
    await waitFor(() => expect(screen.getByText("Voucher 1000")).toBeTruthy());

    expect(screen.getByRole("columnheader", { name: /name/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /symbol/i })).toBeTruthy();
    expect(screen.getByText("V1000")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /^kind$/i })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /^chain$/i })).toBeNull();
    // The kind tab bar stays gone. The three buttons that are here are the
    // visibility filter, which is a different axis — and `all` belongs to it.
    expect(screen.queryByRole("button", { name: /^goods$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^services$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^voucher$/i })).toBeNull();
    expect(screen.getByRole("columnheader", { name: /^status$/i })).toBeTruthy();
    for (const status of ["all", "active", "retired"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${status}$`, "i") })).toBeTruthy();
    }
    expect(screen.getByRole("textbox", { name: "Name, symbol, address" }).className).toContain(
      "h-9",
    );
    expect(screen.getAllByRole("row")[1]?.className).toContain("h-12");
  });

  it("refetches the catalog when Refresh is pressed", async () => {
    listVouchers.mockResolvedValue(PAGE);
    renderVouchersRoute();
    await waitFor(() => expect(screen.getByText("Voucher 1000")).toBeTruthy());
    expect(listVouchers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listVouchers).toHaveBeenCalledTimes(2));
  });
});
