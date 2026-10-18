import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
  // The pool screen's steward reads take a viem client off wagmi; without one
  // they stay disabled, which is what a non-owner sees anyway.
  useClient: () => undefined,
  useBytecode: () => ({ data: undefined, isPending: false }),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    state: "authenticated",
    isAuthenticated: true,
    isLoading: false,
    address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
    session: {
      address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
      role: "USER",
    },
  }),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useLatestAccountTokens: () => ({
    data: { tokens: [] },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useAllAccountIssuedTokens: () => ({
    tokens: [],
    isPending: false,
    isError: false,
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
  // The wallet screen's own pool section. Empty: this file asserts navigation,
  // and a populated list would only add rows for the queries below to match.
  useOwnedPoolsInfinite: () => ({
    data: { pages: [{ pools: [] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchers: () => [],
  usePoolVouchersWithStatus: () => ({
    vouchers: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-voucher-tokens", () => ({
  usePoolVoucherTokens: () => [],
}));

vi.mock("#/features/pools/hooks/use-creditable-pools", () => ({
  useCreditablePools: () => ({
    pools: [],
    status: "ready",
    isRefreshing: false,
    hasVerificationGaps: false,
    retry: vi.fn(),
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-output-availability", () => ({
  usePoolOutputAvailability: (voucher: unknown) => ({
    pools: [],
    status: voucher ? "ready" : "idle",
    isRefreshing: false,
    hasVerificationGaps: false,
    retry: vi.fn(),
  }),
}));

import {
  canonicalMarketplaceSearch,
  marketplaceSearchForScope,
  pickMarketplaceSearch,
  type MarketplaceRouteSearch,
} from "#/lib/navigation/marketplace-search";
import { WalletPage } from "#/features/home/ui/wallet-page";
import { PoolDetailPage, PoolsPage } from "#/features/pools/ui";

function withQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

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
    validateSearch: (search): MarketplaceRouteSearch => pickMarketplaceSearch(search),
    beforeLoad: ({ search }) => {
      throw redirect({
        to: "/market",
        search: marketplaceSearchForScope(search, "pools"),
        replace: true,
      });
    },
  });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/market",
    validateSearch: (search): MarketplaceRouteSearch => pickMarketplaceSearch(search),
    beforeLoad: ({ search }) => {
      const next = canonicalMarketplaceSearch(search);
      if (next) throw redirect({ to: "/market", search: next, replace: true });
    },
    component: () => {
      const { creditable: creditableSearch, out_voucher: outputVoucherSearch } =
        marketRoute.useSearch();
      return (
        <PoolsPage creditableSearch={creditableSearch} outputVoucherSearch={outputVoucherSearch} />
      );
    },
  });
  const poolDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pools/$poolAddress",
    component: () => {
      const { poolAddress } = poolDetailRoute.useParams();
      return <PoolDetailPage poolAddress={poolAddress} activeTab="vouchers" />;
    },
  });
  // Stubbed: this asserts where Deposit goes and that Back comes home, not what
  // the send flow renders once it arrives.
  const sendAmountRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/wallet/send/amount",
    validateSearch: (
      search,
    ): { recipient?: string; recipientLabel?: string; returnPool?: string } => ({
      recipient: typeof search.recipient === "string" ? search.recipient : undefined,
      recipientLabel: typeof search.recipientLabel === "string" ? search.recipientLabel : undefined,
      returnPool: typeof search.returnPool === "string" ? search.returnPool : undefined,
    }),
    component: () => {
      const { recipientLabel } = sendAmountRoute.useSearch();
      return <h1>Amount for {recipientLabel}</h1>;
    },
  });
  return createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      poolsRoute,
      marketRoute,
      poolDetailRoute,
      sendAmountRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pools navigation", () => {
  it("does not expose the removed Wallet Pools shortcut", async () => {
    const router = createTestRouter("/?tab=wallet");
    render(withQueryClient(<RouterProvider router={router} />));

    expect(await screen.findByRole("heading", { name: "Wallet" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Pools" })).toBeNull();
  });

  it("deposits into a pool through the send flow and Back returns to the pool", async () => {
    const router = createTestRouter(`/pools/${POOL_ADDRESS}`);
    render(withQueryClient(<RouterProvider router={router} />));

    const deposit = await screen.findByRole("link", { name: "Deposit" });
    fireEvent.click(deposit);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/wallet/send/amount");
      // The pool is carried as the recipient, so the send flow opens on the
      // amount step rather than asking who to send to.
      expect(router.state.location.search).toMatchObject({
        recipient: POOL_ADDRESS,
        recipientLabel: "Trade Pool",
        // Rides through to the receipt so finishing the deposit lands back on
        // the pool rather than on the wallet.
        returnPool: POOL_ADDRESS,
      });
    });

    await act(async () => {
      router.history.back();
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/pools/${POOL_ADDRESS}`);
    });
  });

  it("opens a pool from the list and Back returns to the list", async () => {
    const router = createTestRouter("/pools");
    render(withQueryClient(<RouterProvider router={router} />));

    fireEvent.click(await screen.findByRole("link", { name: /trade pool/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/pools/${POOL_ADDRESS}`);
      expect(screen.getByRole("heading", { name: "Trade Pool" })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Pools" }));
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/market");
      expect(screen.getByRole("heading", { name: "Pools" })).toBeTruthy();
    });
  });

  it("shows the shared menu instead of a synthetic Back link when deep-linked", async () => {
    const router = createTestRouter("/pools");
    render(withQueryClient(<RouterProvider router={router} />));

    expect(await screen.findByRole("button", { name: "Open menu" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  });
});

describe("pools filter canonicalization through the router", () => {
  it("writes manual Credit changes and restores them through browser history", async () => {
    const router = createTestRouter("/pools?creditable=false");
    render(withQueryClient(<RouterProvider router={router} />));

    const credit = await screen.findByRole("button", { name: "Credit" });
    expect(credit.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(credit);

    await waitFor(() => {
      expect(router.state.location.search.creditable).toBe(true);
      expect(credit.getAttribute("aria-pressed")).toBe("true");
    });

    await act(async () => {
      router.history.back();
    });
    await waitFor(() => {
      expect(router.state.location.search.creditable).toBe(false);
      expect(credit.getAttribute("aria-pressed")).toBe("false");
    });

    await act(async () => {
      router.history.forward();
    });
    await waitFor(() => {
      expect(router.state.location.search.creditable).toBe(true);
      expect(credit.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("canonicalizes explicit Credit state without changing the path", async () => {
    const router = createTestRouter("/pools?creditable=%20TRUE%20");
    render(withQueryClient(<RouterProvider router={router} />));
    await waitFor(() => expect(router.state.status).toBe("idle"));

    expect(router.state.location.pathname).toBe("/market");
    expect(router.state.location.search.creditable).toBe(true);
    expect(router.history.length).toBe(1);
  });

  it("keeps malformed and repeated Credit values visible for explicit rejection", async () => {
    const malformed = createTestRouter("/pools?creditable=yes");
    const first = render(withQueryClient(<RouterProvider router={malformed} />));
    expect(await screen.findByText("This link contains an invalid Credit filter.")).toBeTruthy();
    expect(malformed.state.location.search.creditable).toBe("yes");
    first.unmount();

    const repeated = createTestRouter("/pools?creditable=true&creditable=false");
    const second = render(withQueryClient(<RouterProvider router={repeated} />));
    expect(await screen.findByText("This link contains an invalid Credit filter.")).toBeTruthy();
    expect(repeated.state.location.search.creditable).toEqual([true, false]);
    second.unmount();

    const numeric = createTestRouter("/pools?creditable=1");
    render(withQueryClient(<RouterProvider router={numeric} />));
    expect(await screen.findByText("This link contains an invalid Credit filter.")).toBeTruthy();
  });

  it("canonicalizes an output-voucher address without changing the path", async () => {
    const address = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";
    const router = createTestRouter(`/pools?out_voucher=${address.toUpperCase()}`);
    render(withQueryClient(<RouterProvider router={router} />));
    await waitFor(() => expect(router.state.status).toBe("idle"));

    expect(router.state.location.pathname).toBe("/market");
    expect(router.state.location.search.out_voucher).toBe(address);
    expect(router.history.length).toBe(1);
  });

  it("keeps malformed and repeated output vouchers visible for explicit rejection", async () => {
    const malformed = createTestRouter("/pools?out_voucher=not-an-address");
    const first = render(withQueryClient(<RouterProvider router={malformed} />));
    expect(await screen.findByText("This link contains an invalid output voucher.")).toBeTruthy();
    expect(malformed.state.location.search.out_voucher).toBe("not-an-address");
    first.unmount();

    const repeated = createTestRouter(
      `/pools?out_voucher=${POOL_ADDRESS}&out_voucher=${POOL_ADDRESS}`,
    );
    render(withQueryClient(<RouterProvider router={repeated} />));
    expect(await screen.findByText("This link contains an invalid output voucher.")).toBeTruthy();
    expect(repeated.state.location.search.out_voucher).toEqual([POOL_ADDRESS, POOL_ADDRESS]);
  });

  it("rewrites a non-canonical Pools link in the address bar", async () => {
    const router = createTestRouter("/pools?q=%20%20food%20%20");
    render(withQueryClient(<RouterProvider router={router} />));
    await waitFor(() => expect(router.state.status).toBe("idle"));

    expect(new URLSearchParams(router.history.location.search).get("q")).toBe("food");
    expect(router.history.length).toBe(1);
  });

  it("collapses a repeated tag key on Pools too", async () => {
    const router = createTestRouter("/pools?tags=Growing&tags=Food");
    render(withQueryClient(<RouterProvider router={router} />));
    await waitFor(() => expect(router.state.status).toBe("idle"));

    expect(new URLSearchParams(router.history.location.search).getAll("tags")).toEqual([
      "Food,Growing",
    ]);
  });

  it("settles a canonical Pools link without redirecting", async () => {
    const router = createTestRouter("/pools?q=food");
    render(withQueryClient(<RouterProvider router={router} />));
    await waitFor(() => expect(router.state.status).toBe("idle"));

    expect(router.history.location.search).toContain("q=food");
    expect(router.history.length).toBe(1);
  });

  it("leaves an over-limit Pools link alone rather than truncating it", async () => {
    const tags = Array.from({ length: 13 }, (_, index) => `Tag${index}`);
    const router = createTestRouter(`/pools?${tags.map((tag) => `tags=${tag}`).join("&")}`);
    render(withQueryClient(<RouterProvider router={router} />));
    await waitFor(() => expect(router.state.status).toBe("idle"));

    expect(router.state.location.search.tags).toEqual(tags);
  });
});
