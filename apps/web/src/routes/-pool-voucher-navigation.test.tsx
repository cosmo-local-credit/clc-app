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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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

vi.mock("#/components/catalog-map/market-map.lazy", () => ({
  MarketMap: () => <div data-testid="pool-map" />,
}));

vi.mock("#/features/home/hooks/use-market-camera", () => ({
  CAMERA_RANK: { explicit: 0, liveGps: 1, persistedGps: 2, ipCity: 3, countryDefault: 4 },
  useMarketCamera: () => ({
    camera: null,
    realFix: null,
    userLocation: null,
    locationStatus: "idle",
    requestLocation: () => {},
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: () => ({ data: undefined, isPending: false }),
}));

vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useVoucherOfferingsInfinite: () => ({
    data: { pages: [{ offerings: [] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));

import { PoolDetailPage } from "#/features/pools/ui";
import { VoucherDetailPage } from "#/features/wallet/ui";

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
    function PoolTestPage() {
      const { poolAddress } = useParams({ strict: false });
      const [selected, setSelected] = useState<string>();
      return poolAddress ? (
        <PoolDetailPage
          poolAddress={poolAddress}
          selectedVoucherAddress={selected}
          onSelectVoucher={setSelected}
          onClearVoucher={() => setSelected(undefined)}
        />
      ) : null;
    }
    const poolRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/pools/$poolAddress",
      component: PoolTestPage,
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

    fireEvent.click(await screen.findByRole("button", { name: "Browse vouchers" }));
    fireEvent.click(await screen.findByRole("button", { name: /trade token/i }));

    await waitFor(() => {
      expect(history.location.pathname).toBe(`/pools/${POOL_ADDRESS}`);
    });
    expect(await screen.findByRole("region", { name: "Trade Token" })).toBeTruthy();
    expect(screen.queryByLabelText("Balance")).toBeNull();
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
                geoLat: -3.51,
                geoLng: 39.91,
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
