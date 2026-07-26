import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getMarketVoucher = vi.hoisted(() => vi.fn());

vi.mock("#/features/home/api/market-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/home/api/market-client")>();
  return { ...actual, getMarketVoucher };
});

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
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

vi.mock("#/features/home/hooks/use-market-vouchers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/home/hooks/use-market-vouchers")>();
  return {
    ...actual,
    useMarketMapVouchers: () => ({
      vouchers: [
        {
          id: "2710",
          chainId: 42220,
          address: VOUCHER_ADDRESS,
          name: "Priscilah Malii",
          symbol: "MALII",
          locationName: "C96, KEN",
          lat: -1.450979,
          lng: 38.235115,
          kind: "goods" as const,
        },
      ],
      isLoading: false,
      isCatalogComplete: true,
      error: null,
      retry: () => {},
    }),
  };
});

vi.mock("#/features/home/ui/market-map.lazy", () => ({
  MarketMap: (props: {
    locations: { id: string; name: string }[];
    onSelectLocation: (id: string) => void;
  }) => (
    <div>
      {props.locations.map((location) => (
        <button
          key={location.id}
          type="button"
          data-testid={`marker-${location.id}`}
          onClick={() => props.onSelectLocation(location.id)}
        >
          {location.name}
        </button>
      ))}
    </div>
  ),
}));

import { MarketPage } from "#/features/home/ui/market-page";
import { VoucherDetailPage } from "#/features/home/ui/voucher-detail-page";

const VOUCHER_ADDRESS = "0xAbC0000000000000000000000000000000000123";

function detail() {
  return {
    id: "2710",
    chainId: 42220,
    address: VOUCHER_ADDRESS,
    name: "Priscilah Malii",
    symbol: "MALII",
    decimals: 6,
    ownerAddress: null,
    description: null,
    voucherUoa: "KSH",
    voucherValue: "10",
    locationName: "C96, KEN",
    lat: -1.450979,
    lng: 38.235115,
    email: "issuer@example.org",
    website: null,
    phone: null,
    iconUrl: null,
    bannerUrl: null,
    kind: "goods" as const,
  };
}

function renderAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <MarketPage />,
  });
  const voucherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/$voucherAddress",
    component: () => {
      const { voucherAddress } = useParams({ strict: false });
      return voucherAddress ? <VoucherDetailPage voucherAddress={voucherAddress} /> : null;
    },
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([marketRoute, voucherRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      {/* biome-ignore lint/suspicious/noExplicitAny: the ad-hoc test tree is not the generated route tree */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  getMarketVoucher.mockReset();
  getMarketVoucher.mockResolvedValue(detail());
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("voucher navigation", () => {
  it("opens the voucher page from the map card and Back returns to the map", async () => {
    const router = renderAt("/");
    await waitFor(() => expect(screen.getByTestId("marker-2710")).toBeTruthy());

    fireEvent.click(screen.getByTestId("marker-2710"));
    const card = await waitFor(() => screen.getByRole("link", { name: "Priscilah Malii" }));

    fireEvent.click(card);

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER_ADDRESS}`);
    expect(screen.getByText("issuer@example.org")).toBeTruthy();

    await act(async () => {
      router.history.back();
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.getByTestId("marker-2710")).toBeTruthy();
  });

  // A pasted or shared link arrives with no in-app history and no warm cache.
  it("renders a deep-linked voucher and offers a way back to the market", async () => {
    renderAt(`/vouchers/${VOUCHER_ADDRESS}`);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Priscilah Malii"),
    );
    expect(getMarketVoucher).toHaveBeenCalledWith(VOUCHER_ADDRESS, expect.anything());
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("href")).toBe("/");
  });

  // The card and the page share one query key, so the tap that opened the card
  // is the only fetch. Regressing this makes the page flash a loading state.
  it("reuses the card's fetch instead of refetching on navigation", async () => {
    const router = renderAt("/");
    await waitFor(() => expect(screen.getByTestId("marker-2710")).toBeTruthy());

    fireEvent.click(screen.getByTestId("marker-2710"));
    await waitFor(() => expect(getMarketVoucher).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("link", { name: "Priscilah Malii" }));
    await waitFor(() => expect(router.state.location.pathname).not.toBe("/"));

    // Rendered from cache: the rate is on screen and no second request was made.
    expect(screen.getByText("1 MALII = 10 KSH")).toBeTruthy();
    expect(getMarketVoucher).toHaveBeenCalledTimes(1);
  });
});
