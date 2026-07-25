import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { quoteData, swapMutateAsync } = vi.hoisted(() => ({
  quoteData: {
    amount: "50.00",
    amountRaw: "50000000",
    amountInRaw: "25000000",
    amountOutRaw: "50000000",
    availableAmountOut: "1000.00",
    availableAmountOutRaw: "1000000000",
    grossAmountOutRaw: "50000000",
    hasLiquidity: true,
    blockNumber: 100n,
  },
  swapMutateAsync: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));

vi.mock("#/features/pools/hooks/use-user-pools", () => ({
  useUserPoolByAddress: () => ({
    data: {
      address: "0x1111111111111111111111111111111111111111",
      name: "Trade Pool",
      symbol: "TRD",
    },
    isError: false,
    isLoading: false,
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchers: () => [],
}));

vi.mock("#/features/pools/hooks/use-pool-voucher-tokens", () => ({
  usePoolVoucherTokens: () => [
    {
      id: "0x2222222222222222222222222222222222222222",
      name: "Trade Token",
      symbol: "TTX",
      amount: "100.00",
      balance: "100000000",
      contractAddress: "0x2222222222222222222222222222222222222222",
      tokenDecimals: 6,
    },
    {
      id: "0x3333333333333333333333333333333333333333",
      name: "Rambo Token",
      symbol: "RAMBO",
      amount: "1000.00",
      balance: "1000000000",
      contractAddress: "0x3333333333333333333333333333333333333333",
      tokenDecimals: 6,
    },
  ],
}));

vi.mock("#/features/pools/hooks/use-pool-swap-quote", () => ({
  usePoolSwapQuote: () => ({
    data: quoteData,
    error: null,
    isDebouncing: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: () => Promise.resolve({ data: quoteData, isError: false }),
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-swap-transfer", () => ({
  usePoolSwapTransfer: () => ({
    error: null,
    isPending: false,
    mutateAsync: swapMutateAsync,
  }),
}));

import { PoolSwapPage } from "#/features/pools/ui";

const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";

function createTestRouter() {
  const rootRoute = createRootRoute({ component: Outlet });
  const swapRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress/swap",
    component: () => {
      const { poolAddress } = swapRoute.useParams();
      return <PoolSwapPage poolAddress={poolAddress} />;
    },
  });
  const receiptRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress/swap/receipt",
    component: () => <h1>Tracked swap receipt</h1>,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([swapRoute, receiptRoute]),
    history: createMemoryHistory({ initialEntries: [`/pools/${POOL_ADDRESS}/swap`] }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  swapMutateAsync.mockReset();
});

describe("pool swap navigation", () => {
  it("goes directly to the tracked receipt and Back returns to the swap", async () => {
    swapMutateAsync.mockResolvedValue({
      trackingId: "swap-tracking-1",
      signatureType: "secp256k1",
    });
    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: /^swap$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    expect(await screen.findByRole("heading", { name: /tracked swap receipt/i })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/pools/${POOL_ADDRESS}/swap/receipt`);
    expect(router.state.location.search).toMatchObject({ trackingId: "swap-tracking-1" });

    router.history.back();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/pools/${POOL_ADDRESS}/swap`);
      expect(screen.getByRole("heading", { name: /^swap$/i })).toBeTruthy();
    });
  });
});
