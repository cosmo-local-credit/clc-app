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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getMarketVoucher = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/market/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clc/api/features/market/client")>();
  return { ...actual, getMarketVoucher };
});

vi.mock("wagmi", () => ({
  useClient: () => undefined,
  useConnection: () => ({ address: undefined }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("#/features/home/hooks/use-creditable-browse", () => ({
  useCreditableBrowse: () => ({
    auth: { isAuthenticated: true, isLoading: false },
    parsed: { ok: true, enabled: null },
    enabled: false,
    verification: { status: "idle", pools: [], retry: vi.fn() },
    poolRefs: undefined,
    blocksResults: false,
  }),
}));

vi.mock("#/features/home/hooks/use-marketplace-map-search", () => ({
  useMarketplaceMapSearch: () => ({
    locations: [],
    status: "disabled",
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div data-testid="location-map" />,
}));

vi.mock("#/features/home/hooks/use-market-camera", () => ({
  CAMERA_RANK: {
    explicit: 0,
    selectedVoucher: 1,
    savedProfile: 2,
    liveGps: 3,
    persistedGps: 4,
    ipCity: 5,
    countryDefault: 6,
  },
  REAL_FIX_ZOOM: 14,
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

const emptyOfferings = vi.hoisted(() => () => ({
  data: { pages: [{ offerings: [] }] },
  isPending: false,
  isError: false,
  isSuccess: true,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => {},
  refetch: () => {},
}));

vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useVoucherOfferingsInfinite: emptyOfferings,
  useManagedVoucherOfferingsInfinite: emptyOfferings,
}));

vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: () => Promise.resolve({ url: "https://cdn.test/offering/a_800_b.webp" }),
    reset: () => {},
    isPending: false,
    isError: false,
  }),
}));

vi.mock("#/features/wallet/hooks/use-offering-mutations", () => ({
  useCreateVoucherOffering: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateVoucherOffering: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteVoucherOffering: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("#/features/home/hooks/use-reports", () => ({
  useVoucherReportsInfinite: () => ({
    data: { pages: [{ reports: [] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));

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

vi.mock("#/lib/api/pools", () => ({
  poolsClient: {
    getFilteredPools: async () => ({ pools: [], receivedCount: 0, first: 0, last: 0 }),
  },
}));

// The app-owned client is the seam the code now goes through. Build it from
// the already-mocked resource modules above so their overrides still apply.
vi.mock("#/lib/api/market", async () => ({
  marketClient: await import("@clc/api/features/market/client"),
}));

import { MarketPage } from "#/features/home/ui/market-page";
import { VoucherDetailPage, type VoucherOrigin } from "#/features/wallet/ui";
import { pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { parseHomeSearch } from "#/lib/navigation/home-tabs";

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
    validateSearch: (search) => ({ ...parseHomeSearch(search), ...pickCatalogSearch(search) }),
    component: () => <MarketPage />,
  });
  const voucherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/vouchers/$voucherAddress",
    validateSearch: (
      search,
    ): { tab?: "activity" | "info" | "reviews" | "posts"; from?: VoucherOrigin } => ({
      tab:
        search.tab === "activity" ||
        search.tab === "info" ||
        search.tab === "reviews" ||
        search.tab === "posts"
          ? search.tab
          : undefined,
      from:
        search.from === "wallet" || search.from === "vouchers" || search.from === "market"
          ? search.from
          : undefined,
    }),
    component: () => {
      const { voucherAddress } = useParams({ strict: false });
      const { tab, from } = useSearch({ strict: false });
      const activeTab =
        tab === "activity" || tab === "info" || tab === "reviews" || tab === "posts"
          ? tab
          : undefined;
      return voucherAddress ? (
        <VoucherDetailPage
          voucherAddress={voucherAddress}
          activeTab={activeTab}
          // Non-strict search spans every route, Install's "settings" included.
          origin={from === "wallet" || from === "vouchers" ? from : "market"}
        />
      ) : null;
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

/** Inspect the complete sheet, then follow a dedicated voucher route. */
async function openVoucherPageAfterInspectingSheet(router: ReturnType<typeof renderAt>) {
  fireEvent.click(screen.getByTestId("marker-2710"));
  const dialog = await screen.findByRole("dialog", { name: "Priscilah Malii" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Expand" }));
  expect(await within(dialog).findByRole("heading", { name: "Info" })).toBeTruthy();
  expect(within(dialog).queryByRole("link", { name: "Open voucher page" })).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Priscilah Malii" })).toBeNull());
  await act(async () => {
    await router.navigate({
      to: "/vouchers/$voucherAddress",
      params: { voucherAddress: VOUCHER_ADDRESS },
    });
  });
}

describe("voucher navigation", () => {
  it("opens the continuous voucher page and returns to the map in one Back", async () => {
    const router = renderAt("/");
    await waitFor(() => expect(screen.getByTestId("marker-2710")).toBeTruthy());

    await openVoucherPageAfterInspectingSheet(router);

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(router.state.location.pathname).toBe(`/vouchers/${VOUCHER_ADDRESS}`);
    expect(screen.getByText("No offerings yet")).toBeTruthy();
    expect(screen.getByText("issuer@example.org")).toBeTruthy();
    expect(screen.getByText("No posts yet.")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();

    await act(async () => {
      router.history.back();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.getByTestId("marker-2710")).toBeTruthy();
  });

  // A pasted or shared link arrives with no in-app history and no warm cache.
  it("renders a deep-linked voucher and offers a way back to the market", async () => {
    renderAt(`/vouchers/${VOUCHER_ADDRESS}?tab=info`);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Priscilah Malii"),
    );
    expect(getMarketVoucher).toHaveBeenCalledWith(VOUCHER_ADDRESS, expect.anything());
    expect(screen.getByRole("link", { name: "Market" }).getAttribute("href")).toBe("/");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Info" })),
    );
  });

  // Opened from the wallet balances, Back must name — and fall back to — the
  // wallet, not the market map.
  it("names the wallet as the origin when the voucher was opened from balances", async () => {
    renderAt(`/vouchers/${VOUCHER_ADDRESS}?from=wallet`);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Priscilah Malii"),
    );
    expect(screen.getByRole("link", { name: "Wallet" }).getAttribute("href")).toBe("/?tab=wallet");
  });

  // The card and the page share one query key, so the tap that opened the card
  // is the only fetch. Regressing this makes the page flash a loading state.
  it("reuses the card's fetch instead of refetching on navigation", async () => {
    const router = renderAt("/");
    await waitFor(() => expect(screen.getByTestId("marker-2710")).toBeTruthy());

    await openVoucherPageAfterInspectingSheet(router);
    await waitFor(() => expect(router.state.location.pathname).not.toBe("/"));

    // Rendered from cache: detail-backed info is already part of the page.
    expect(await screen.findByText("1 MALII = 10 KSH")).toBeTruthy();
    expect(getMarketVoucher).toHaveBeenCalledTimes(1);
  });
});

vi.mock("#/lib/discovery-location", () => ({ useDiscoveryLocation: () => ({ realFix: null }) }));
