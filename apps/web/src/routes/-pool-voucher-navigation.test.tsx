import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
  // The pool screen's steward reads take a viem client off wagmi; without one
  // they stay disabled, which is what a non-owner sees anyway.
  useClient: () => undefined,
  useBytecode: () => ({ data: undefined, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PoolDetailPage } from "#/features/pools/ui";
import { VoucherDetailPage } from "#/features/wallet/ui";
import { parseVoucherSheetSearch } from "#/lib/navigation/voucher-sheet-search";

const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";
const TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pool voucher navigation", () => {
  it("opens a pool voucher the account does not hold and Back returns to the pool", async () => {
    mockRequests();
    const rootRoute = createRootRoute({ component: Outlet });
    const poolRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/pools/$poolAddress",
      validateSearch: (search) => parseVoucherSheetSearch(search),
      component: () => {
        const { poolAddress } = useParams({ strict: false });
        return poolAddress ? (
          <PoolDetailPage poolAddress={poolAddress} activeTab="vouchers" />
        ) : null;
      },
    });
    const voucherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/vouchers/$voucherAddress",
      validateSearch: (search): { poolAddress?: string } => ({
        poolAddress: typeof search.poolAddress === "string" ? search.poolAddress : undefined,
      }),
      component: () => {
        const { voucherAddress } = useParams({ strict: false });
        const { poolAddress } = useSearch({ strict: false });
        return voucherAddress ? (
          <VoucherDetailPage
            voucherAddress={voucherAddress}
            activeTab="offerings"
            poolAddress={poolAddress}
          />
        ) : null;
      },
    });
    const history = createMemoryHistory({ initialEntries: [`/pools/${POOL_ADDRESS}`] });
    const router = createRouter({
      routeTree: rootRoute.addChildren([poolRoute, voucherRoute]),
      history,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await router.load();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    // The row opens the voucher's card; its page is the card's last link.
    fireEvent.click(await screen.findByRole("button", { name: /trade token/i }));
    await screen.findByRole("dialog", { name: "Trade Token" });
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(await screen.findByRole("link", { name: "Open voucher page" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe(`/vouchers/${TOKEN_ADDRESS.toLowerCase()}`);
      expect(history.location.search).toBe(`?poolAddress=${POOL_ADDRESS}`);
    });
    expect(await screen.findByText("Trade Token")).toBeTruthy();
    expect(screen.getByLabelText("Balance").textContent).toMatch(/0\s*TTX/);

    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Pool" }));
    });

    // Back lands on the pool with the card it was opened from still open over
    // it; the pool sits behind the card's backdrop until the card closes.
    await waitFor(() => {
      expect(history.location.pathname).toBe(`/pools/${POOL_ADDRESS}`);
      expect(screen.getByRole("dialog", { name: "Trade Token" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Trade Pool", hidden: true })).toBeTruthy();
    });
  });

  it("swaps for a voucher from its row and Back returns to the pool", async () => {
    mockRequests();
    const rootRoute = createRootRoute({ component: Outlet });
    const poolRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/pools/$poolAddress",
      component: () => {
        const { poolAddress } = useParams({ strict: false });
        return poolAddress ? (
          <PoolDetailPage poolAddress={poolAddress} activeTab="vouchers" />
        ) : null;
      },
    });
    const swapRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/pools/$poolAddress/swap",
      validateSearch: (search): { receive?: string } => ({
        receive: typeof search.receive === "string" ? search.receive : undefined,
      }),
      component: () => <h1>Swap screen</h1>,
    });
    const history = createMemoryHistory({ initialEntries: [`/pools/${POOL_ADDRESS}`] });
    const router = createRouter({
      routeTree: rootRoute.addChildren([poolRoute, swapRoute]),
      history,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await router.load();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    // The row's Swap stands in for the offer count and opens the pool's swap
    // with this voucher as the one to receive.
    fireEvent.click(await screen.findByRole("link", { name: "Swap for TTX" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe(`/pools/${POOL_ADDRESS}/swap`);
      expect(history.location.search).toBe(`?receive=${TOKEN_ADDRESS.toLowerCase()}`);
      expect(screen.getByRole("heading", { name: "Swap screen" })).toBeTruthy();
    });

    await act(async () => {
      router.history.back();
    });

    await waitFor(() => {
      expect(history.location.pathname).toBe(`/pools/${POOL_ADDRESS}`);
      expect(screen.getByRole("heading", { name: "Trade Pool" })).toBeTruthy();
    });
  });
});

function mockRequests() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}/vouchers`)) {
        return Promise.resolve(
          response({
            vouchers: [
              {
                id: 2,
                address: TOKEN_ADDRESS,
                name: "Trade Token",
                symbol: "TTX",
                decimals: 6,
                iconUrl: "https://pool.example/ttx.png",
              },
            ],
          }),
        );
      }
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}`)) {
        return Promise.resolve(
          response({ address: POOL_ADDRESS, name: "Trade Pool", symbol: "TRD" }),
        );
      }
      if (url.includes(`/api/v2/vouchers/${TOKEN_ADDRESS}`)) {
        return Promise.resolve(
          response({
            voucher: {
              id: 2,
              address: TOKEN_ADDRESS,
              name: "Trade Token",
              symbol: "TTX",
              decimals: 6,
              iconUrl: "https://pool.example/ttx.png",
            },
          }),
        );
      }
      if (url.includes("/api/v2/accounts/") && url.includes("/tokens")) {
        return Promise.resolve(response({ tokens: [] }));
      }
      if (url.includes("/api/v2/accounts/") && url.includes("/transfers")) {
        return Promise.resolve(response({ transfers: [] }));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }),
  );
}

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}
