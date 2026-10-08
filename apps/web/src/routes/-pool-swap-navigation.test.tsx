import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { quoteData, swapMutateAsync } = vi.hoisted(() => ({
  quoteData: {
    amount: "50.00",
    amountRaw: "50000000",
    amountInRaw: "25000000",
    amountOutRaw: "50000000",
    settlementAmountOutRaw: "50000000",
    availableAmountOut: "1000.00",
    availableAmountOutRaw: "1000000000",
    grossAmountOutRaw: "50000000",
    fees: { poolFeeRaw: "0", protocolFeeRaw: "0", poolFeePpm: "0" },
    feeBreakdown: {
      grossAmountOutRaw: "50000000",
      poolFeeRaw: "0",
      protocolFeeRaw: "0",
      totalFeeRaw: "0",
    },
    feeAmountRaw: "0",
    hasLiquidity: true,
    blockNumber: 100n,
  },
  swapMutateAsync: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
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

vi.mock("#/features/pools/hooks/use-pool-swap-vouchers", () => ({
  usePoolSwapVouchers: () => ({
    vouchers: [
      {
        id: "1",
        tokenAddress: "0x2222222222222222222222222222222222222222",
        name: "Trade Token",
        symbol: "TTX",
        decimals: 6,
        iconUrl: null,
        tokenLimit: null,
      },
      {
        id: "2",
        tokenAddress: "0x3333333333333333333333333333333333333333",
        name: "Rambo Token",
        symbol: "RAMBO",
        decimals: 6,
        iconUrl: null,
        tokenLimit: null,
      },
      {
        id: "3",
        tokenAddress: "0x4444444444444444444444444444444444444444",
        name: "Third Token",
        symbol: "THIRD",
        decimals: 6,
        iconUrl: null,
        tokenLimit: null,
      },
    ],
    isPending: false,
    isError: false,
    refetch: () => Promise.resolve(),
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-swap-tokens", () => ({
  usePoolSwapTokenReads: () => ({
    data: new Map([
      [
        "0x2222222222222222222222222222222222222222",
        {
          holderBalanceRaw: "100000000",
          poolBalanceRaw: "500000000",
          feesRaw: "0",
          limitRaw: null,
        },
      ],
      [
        "0x3333333333333333333333333333333333333333",
        {
          holderBalanceRaw: "1000000000",
          poolBalanceRaw: "500000000",
          feesRaw: "0",
          limitRaw: null,
        },
      ],
      [
        "0x4444444444444444444444444444444444444444",
        {
          holderBalanceRaw: "50000000",
          poolBalanceRaw: "500000000",
          feesRaw: "0",
          limitRaw: null,
        },
      ],
    ]),
    isLoading: false,
    isError: false,
    refetch: () => Promise.resolve(),
  }),
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

vi.mock("#/features/pools/hooks/use-pool-swap-maximum", () => ({
  usePoolSwapMaximum: () => ({ data: undefined, isFetching: false }),
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

function createTestRouter(search = "") {
  const rootRoute = createRootRoute({ component: Outlet });
  const swapRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress/swap",
    component: () => {
      const { poolAddress } = swapRoute.useParams();
      return (
        <PoolSwapPage
          poolAddress={poolAddress}
          receiveTokenAddress={new URLSearchParams(search).get("receive") ?? undefined}
        />
      );
    },
  });
  const receiptRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress/swap/receipt",
    component: () => <h1>Tracked swap receipt</h1>,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([swapRoute, receiptRoute]),
    history: createMemoryHistory({ initialEntries: [`/pools/${POOL_ADDRESS}/swap${search}`] }),
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

    // The amount field opens empty, so the swap has to be sized before the CTA
    // enables — the screen no longer seeds a figure the holder did not choose.
    fireEvent.change(await screen.findByRole("textbox", { name: "You receive" }), {
      target: { value: "25" },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
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

  it("opens on the voucher it was linked with and sends from another holding", async () => {
    const router = createTestRouter("?receive=0x3333333333333333333333333333333333333333");
    render(<RouterProvider router={router} />);

    const receive = await screen.findByRole("group", { name: "You receive" });
    expect(within(receive).getByText("RAMBO")).toBeTruthy();
    // RAMBO is also the largest holding, which would otherwise be the default
    // From; the swap must not open as RAMBO for RAMBO.
    expect(within(screen.getByRole("group", { name: "You send" })).getByText("TTX")).toBeTruthy();
  });

  it("keeps the send voucher when the receive voucher is changed", async () => {
    render(
      <RouterProvider
        router={createTestRouter("?receive=0x3333333333333333333333333333333333333333")}
      />,
    );

    const receive = await screen.findByRole("group", { name: "You receive" });
    fireEvent.click(within(receive).getByText("RAMBO"));
    fireEvent.click(await screen.findByRole("button", { name: /THIRD/ }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("group", { name: "You receive" })).getByText("THIRD"),
      ).toBeTruthy();
    });
    // The holder's largest holding is RAMBO, but they arrived for RAMBO: the
    // send side stays on what it opened with rather than flipping to it.
    expect(within(screen.getByRole("group", { name: "You send" })).getByText("TTX")).toBeTruthy();
  });

  it("opens on the pool's own defaults without a linked voucher", async () => {
    render(<RouterProvider router={createTestRouter()} />);

    const send = await screen.findByRole("group", { name: "You send" });
    expect(within(send).getByText("RAMBO")).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "You receive" })).getByText("TTX"),
    ).toBeTruthy();
  });
});
