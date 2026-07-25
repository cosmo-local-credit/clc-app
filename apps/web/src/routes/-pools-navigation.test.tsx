import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useLatestAccountTokens: () => ({
    data: { tokens: [] },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/pools/hooks/use-user-pools", () => ({
  useUserPoolsInfinite: () => ({
    data: { pages: [{ pools: [{ address: POOL_ADDRESS, name: "Trade Pool", tags: [] }] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
  useUserPoolByAddress: () => ({
    data: { address: POOL_ADDRESS, name: "Trade Pool", symbol: "TRD", tags: [] },
    isPending: false,
    isError: false,
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchers: () => [],
}));

vi.mock("#/features/pools/hooks/use-pool-voucher-tokens", () => ({
  usePoolVoucherTokens: () => [],
}));

import { WalletPage } from "#/features/home/ui/wallet-page";
import { PoolDetailPage, PoolsPage } from "#/features/pools/ui";

function createTestRouter(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search): { tab?: string } => ({
      tab: typeof search.tab === "string" ? search.tab : undefined,
    }),
    component: () => <WalletPage address="0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" />,
  });
  const poolsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools",
    component: () => <PoolsPage />,
  });
  const poolDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress",
    component: () => {
      const { poolAddress } = poolDetailRoute.useParams();
      return <PoolDetailPage poolAddress={poolAddress} />;
    },
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, poolsRoute, poolDetailRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pools navigation", () => {
  it("reaches Pools from the wallet action row and Back returns to the wallet tab", async () => {
    const router = createTestRouter("/?tab=wallet");
    render(<RouterProvider router={router} />);

    const poolsAction = await screen.findByRole("link", { name: /pools/i });
    expect(poolsAction.getAttribute("href")).toBe("/pools");
    fireEvent.click(poolsAction);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/pools");
      expect(screen.getByRole("heading", { name: "Pools" })).toBeTruthy();
    });

    await act(async () => {
      router.history.back();
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.search).toMatchObject({ tab: "wallet" });
    });
  });

  it("opens a pool from the list and Back returns to the list", async () => {
    const router = createTestRouter("/pools");
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("link", { name: /trade pool/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/pools/${POOL_ADDRESS}`);
      expect(screen.getByRole("heading", { name: "Trade Pool" })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pools" }));
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/pools");
      expect(screen.getByRole("heading", { name: "Pools" })).toBeTruthy();
    });
  });

  it("falls back to the wallet tab when the pools list is deep-linked", async () => {
    const router = createTestRouter("/pools");
    render(<RouterProvider router={router} />);

    const back = await screen.findByRole("link", { name: "Wallet" });
    expect(back.getAttribute("href")).toBe("/?tab=wallet");
  });
});
