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
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PoolDetailPage } from "#/features/pools/ui";
import { TokenDetailPage } from "#/features/wallet/ui";

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
      component: () => {
        const { poolAddress } = useParams({ strict: false });
        return poolAddress ? <PoolDetailPage poolAddress={poolAddress} /> : null;
      },
    });
    const tokenRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/wallet/tokens/$tokenId",
      validateSearch: (search): { poolAddress?: string } => ({
        poolAddress: typeof search.poolAddress === "string" ? search.poolAddress : undefined,
      }),
      component: () => {
        const { tokenId } = useParams({ strict: false });
        const { poolAddress } = useSearch({ strict: false });
        return tokenId ? <TokenDetailPage tokenId={tokenId} poolAddress={poolAddress} /> : null;
      },
    });
    const history = createMemoryHistory({ initialEntries: [`/pools/${POOL_ADDRESS}`] });
    const router = createRouter({
      routeTree: rootRoute.addChildren([poolRoute, tokenRoute]),
      history,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await router.load();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("link", { name: /trade token/i }));

    await waitFor(() => {
      expect(history.location.pathname).toBe(`/wallet/tokens/${TOKEN_ADDRESS.toLowerCase()}`);
      expect(history.location.search).toBe(`?poolAddress=${POOL_ADDRESS}`);
    });
    expect(await screen.findByText("Trade Token")).toBeTruthy();
    expect(screen.getByText("TTX").parentElement?.textContent).toMatch(/0\s*TTX/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pool" }));
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
