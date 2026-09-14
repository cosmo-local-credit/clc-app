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

import {
  canonicalRedirectSearch,
  type CatalogRouteSearch,
  pickCatalogSearch,
} from "#/lib/navigation/catalog-search";
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
    validateSearch: (search): CatalogRouteSearch => pickCatalogSearch(search),
    beforeLoad: ({ search }) => {
      const next = canonicalRedirectSearch(search);
      if (!next) return;
      throw redirect({ to: "/pools", search: next, replace: true });
    },
    component: () => <PoolsPage />,
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
    validateSearch: (search): { recipient?: string; recipientLabel?: string } => ({
      recipient: typeof search.recipient === "string" ? search.recipient : undefined,
      recipientLabel: typeof search.recipientLabel === "string" ? search.recipientLabel : undefined,
    }),
    component: () => {
      const { recipientLabel } = sendAmountRoute.useSearch();
      return <h1>Amount for {recipientLabel}</h1>;
    },
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, poolsRoute, poolDetailRoute, sendAmountRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pools navigation", () => {
  it("reaches Pools from the wallet action row and Back returns to the wallet tab", async () => {
    const router = createTestRouter("/?tab=wallet");
    render(withQueryClient(<RouterProvider router={router} />));

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
      expect(router.state.location.pathname).toBe("/pools");
      expect(screen.getByRole("heading", { name: "Pools" })).toBeTruthy();
    });
  });

  it("falls back to the wallet tab when the pools list is deep-linked", async () => {
    const router = createTestRouter("/pools");
    render(withQueryClient(<RouterProvider router={router} />));

    const back = await screen.findByRole("link", { name: "Wallet" });
    expect(back.getAttribute("href")).toBe("/?tab=wallet");
  });
});

describe("pools filter canonicalization through the router", () => {
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
