import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { CHAIN_INFO } from "#/lib/chain";
import { RELAYER_GAS_FLOOR_LABEL } from "./relayer-gas";

const dashboardStats = vi.hoisted(() =>
  vi.fn(() => ({
    data: {
      range: {
        preset: "1d",
        since: "2026-08-12T00:00:00Z",
        until: "2026-08-13T00:00:00Z",
        bucket: "1h",
      },
      pools: 12,
      vouchers: 40,
      reports: 7,
      accounts: 9,
      transactions: 88 as number | null,
      catalogSeries: [{ t: "2026-08-12T00:00:00Z", reports: 1, vouchers: 2, pools: 0 }],
      transactionSeries: [{ t: "2026-08-12T00:00:00Z", transactions: 16 }],
    },
    isPending: false,
    isError: false,
    error: null,
  })),
);
const relayerGas = vi.hoisted(() =>
  vi.fn(() => ({
    data: { address: "0xabc", wei: (12n * 10n ** 18n).toString() },
    isPending: false,
    isError: false,
    error: null,
  })),
);

vi.mock("./use-dashboard-metrics", () => ({
  useDashboardStats: () => dashboardStats(),
  useRelayerGas: () => relayerGas(),
}));

const { DashboardPage } = await import("./dashboard-page");

function renderPage() {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <DashboardPage search={{}} onSearchChange={() => undefined} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("DashboardPage", () => {
  it("renders full totals and the activity chart without sample labelling", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("88")).toBeTruthy();
    expect(screen.getByText(`12 ${CHAIN_INFO.nativeSymbol}`)).toBeTruthy();
    expect(screen.getAllByText("last 1d").length).toBeGreaterThan(0);
    expect(screen.getByText("Catalog")).toBeTruthy();
    expect(screen.getAllByText("Transactions").length).toBeGreaterThan(1);
    expect(screen.queryByText(/sample/i)).toBeNull();
    expect(screen.queryByText("unavailable")).toBeNull();
  });

  it("turns relayer gas red when the balance is below the floor", async () => {
    relayerGas.mockReturnValueOnce({
      data: { address: "0xabc", wei: (4n * 10n ** 18n).toString() },
      isPending: false,
      isError: false,
      error: null,
    });

    const { container } = renderPage();
    expect(await screen.findByText(`4 ${CHAIN_INFO.nativeSymbol}`)).toBeTruthy();
    expect(screen.getByText(`below ${RELAYER_GAS_FLOOR_LABEL}`)).toBeTruthy();
    expect(container.querySelector(".text-destructive")).toBeTruthy();
  });

  it("marks transactions unavailable when federation omitted the total", async () => {
    dashboardStats.mockReturnValueOnce({
      data: {
        range: {
          preset: "1h",
          since: "2026-08-13T00:00:00Z",
          until: "2026-08-13T01:00:00Z",
          bucket: "5m",
        },
        pools: 1,
        vouchers: 2,
        reports: 3,
        accounts: 4,
        transactions: null,
        catalogSeries: [],
        transactionSeries: [],
      },
      isPending: false,
      isError: false,
      error: null,
    });

    renderPage();
    expect(await screen.findByText("unavailable")).toBeTruthy();
  });
});
