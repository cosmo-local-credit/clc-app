import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type { MarketVoucher, MarketVoucherDetail } from "@clc/api/features/market/client";
import type { MarketPoolLocation } from "#/features/home/hooks/use-market-pools";
import type { MarketLocation } from "./market-data";
import type { MarketCamera } from "./market-map";

type MapProps = {
  locations: MarketLocation[];
  selectedLocationId: string | null;
  camera: MarketCamera | null;
  fitBounds?: {
    key: string;
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
  userLocation: { lat: number; lng: number } | null;
  onSelectLocation: (id: string) => void;
  onDeselect?: () => void;
  onViewportSettled?: (viewport: {
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
    lat: number;
    lng: number;
  }) => void;
};

const {
  authState,
  creditFeedback,
  cameraResult,
  vouchersResult,
  detailResult,
  detailRequests,
  lastMapProps,
  mockRequestLocation,
  mockRetry,
  routeSearch,
  mockNavigate,
  filteredResult,
  lastAppMenuProps,
  profileRequests,
  profileResult,
  routerIndex,
  poolsResult,
} = vi.hoisted(() => ({
  authState: { current: { isAuthenticated: false, isLoading: false, session: null } },
  creditFeedback: { current: false },
  poolsResult: {
    current: [] as MarketPoolLocation[],
    error: null as Error | null,
    retry: vi.fn(),
    enabled: [] as boolean[],
  },
  routerIndex: { current: 0 },
  detailResult: {
    current: { data: undefined as MarketVoucherDetail | undefined, isPending: false },
  },
  detailRequests: { current: [] as (string | undefined)[] },
  cameraResult: {
    current: {
      camera: null as MarketCamera | null,
      realFix: null as { lat: number; lng: number } | null,
      userLocation: null as { lat: number; lng: number } | null,
      locationStatus: "idle" as string,
      requestLocation: () => {},
    },
  },
  vouchersResult: {
    current: {
      vouchers: [] as MarketVoucher[],
      isLoading: false,
      isCatalogComplete: false,
      error: null as Error | null,
      retry: () => {},
    },
  },
  lastMapProps: { current: null as MapProps | null },
  mockRequestLocation: vi.fn(),
  mockRetry: vi.fn(),
  routeSearch: { current: {} as Record<string, unknown> },
  mockNavigate: vi.fn(),
  filteredResult: {
    current: {
      data: undefined as { vouchers: MarketVoucher[]; tagFacets: null } | undefined,
      error: null as Error | null,
      isPlaceholderData: false,
      refetch: vi.fn(),
    },
  },
  lastAppMenuProps: { current: null as Record<string, unknown> | null },
  profileRequests: { current: 0 },
  profileResult: {
    current: {
      data: undefined as { geoLat?: number | null; geoLng?: number | null } | undefined,
      isPending: false,
      isError: false,
    },
  },
}));

function scalar(key: string, value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`search value for ${key} is not a URL scalar`);
}

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xabc0000000000000000000000000000000000123",
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => authState.current,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: undefined }),
}));

vi.mock("#/features/home/hooks/use-creditable-browse", () => ({
  useCreditableBrowse: () => ({
    auth: { isAuthenticated: false, isLoading: false },
    parsed: { ok: true, enabled: null },
    enabled: false,
    verification: { status: "idle", pools: [], retry: vi.fn() },
    poolRefs: undefined,
    blocksResults: false,
  }),
}));

vi.mock("#/components/creditable-browse-control", () => ({
  hasCreditFeedback: () => creditFeedback.current,
  CreditableBrowseControl: ({
    part,
    onChange,
    onClear,
  }: {
    part: "control" | "feedback";
    onChange: (checked: boolean) => void;
    onClear: () => void;
  }) => (
    <div data-testid={`credit-${part}`}>
      <button type="button" onClick={() => onChange(true)}>
        {part} Credit on
      </button>
      <button type="button" onClick={onClear}>
        {part} Credit clear
      </button>
    </div>
  ),
}));

vi.mock("#/features/home/hooks/use-marketplace-map-search", () => ({
  useMarketplaceMapSearch: (_filter: unknown, _pools: unknown, enabled: boolean) => ({
    locations: enabled ? (filteredResult.current.data?.vouchers ?? []) : [],
    status: !enabled
      ? "disabled"
      : filteredResult.current.isPlaceholderData
        ? "loading"
        : filteredResult.current.error
          ? "error"
          : filteredResult.current.data
            ? "ready"
            : "loading",
    error: enabled ? filteredResult.current.error : null,
    retry: filteredResult.current.refetch,
  }),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({
    tokens: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAccountTransfersInfinite: () => ({
    data: { pages: [{ transfers: [] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock("#/features/home/hooks/use-market-camera", () => ({
  CAMERA_RANK: {
    explicit: 0,
    selectedVoucher: 1,
    restored: 2,
    savedProfile: 3,
    liveGps: 4,
    persistedGps: 5,
    ipCity: 6,
    countryDefault: 7,
  },
  REAL_FIX_ZOOM: 14,
  useMarketCamera: () => cameraResult.current,
}));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  // Disabled calls are what a guest makes: counted, they would mean a request.
  useAuthProfile: ({ enabled = true }: { enabled?: boolean } = {}) => {
    if (enabled) profileRequests.current += 1;
    return enabled ? profileResult.current : { data: undefined, isPending: true, isError: false };
  },
}));

vi.mock("#/components/app-menu", () => ({
  AppMenu: (props: { className?: string }) => {
    lastAppMenuProps.current = props;
    return (
      <div data-testid="app-menu" className={props.className}>
        <button type="button">Open menu</button>
      </div>
    );
  },
}));

vi.mock("#/features/home/hooks/use-market-vouchers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/home/hooks/use-market-vouchers")>();
  return {
    ...actual,
    useMarketMapVouchers: (_viewport: unknown, _perPage: unknown, enabled = true) =>
      enabled ? vouchersResult.current : { ...vouchersResult.current, vouchers: [] },
  };
});

vi.mock("#/features/home/hooks/use-market-pools", () => ({
  useMarketMapPools: (enabled: boolean) => {
    poolsResult.enabled.push(enabled);
    return {
      pools: enabled ? poolsResult.current : [],
      error: enabled ? poolsResult.error : null,
      retry: poolsResult.retry,
    };
  },
}));

vi.mock("#/features/home/hooks/use-filtered-market-vouchers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/features/home/hooks/use-filtered-market-vouchers")>();
  return {
    ...actual,
    useFilteredMarketVouchers: (filter: unknown) => ({
      ...filteredResult.current,
      isEnabled: filter !== null,
    }),
    useMarketFacetVocabulary: () => ({ data: undefined }),
  };
});

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: (address: string | undefined) => {
    detailRequests.current.push(address);
    // Disabled without an address, like the real query.
    return address ? detailResult.current : { data: undefined, isPending: false };
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => routeSearch.current,
  useNavigate: () => mockNavigate,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { state: { __TSR_index: number } } }) => unknown;
  }) => select({ location: { state: { __TSR_index: routerIndex.current } } }),
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    search?:
      | Record<string, string | undefined>
      | ((previous: Record<string, unknown>) => Record<string, unknown>);
    children?: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    );
    const resolved = typeof search === "function" ? search(routeSearch.current) : (search ?? {});
    const query = new URLSearchParams(
      Object.entries(resolved).flatMap(([key, value]): [string, string][] => {
        if (value === undefined) return [];
        if (Array.isArray(value)) return value.map((entry) => [key, scalar(key, entry)]);
        return [[key, scalar(key, value)]];
      }),
    ).toString();
    return (
      <a href={query ? `${path}?${query}` : path} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock("./market-map.lazy", () => ({
  MarketMap: (props: MapProps) => {
    lastMapProps.current = props;
    return (
      <div data-testid="market-map">
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
    );
  },
}));

import { MarketPage } from "./market-page";

function voucher(id: string, overrides: Partial<MarketVoucher> = {}): MarketVoucher {
  return {
    id,
    chainId: 42220,
    address: "0xAbC0000000000000000000000000000000000123",
    name: `Voucher ${id}`,
    symbol: "VOUCHER",
    iconUrl: null,
    locationName: null,
    lat: -1.29,
    lng: 36.82,
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
    ...overrides,
  };
}

function renderPage(node: ReactNode = <MarketPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  authState.current = { isAuthenticated: false, isLoading: false, session: null };
  creditFeedback.current = false;
  window.localStorage.clear();
  mockRequestLocation.mockReset();
  mockRetry.mockReset();
  lastMapProps.current = null;
  detailRequests.current = [];
  detailResult.current = { data: undefined, isPending: false };
  cameraResult.current = {
    camera: null,
    realFix: null,
    userLocation: null,
    locationStatus: "idle",
    requestLocation: mockRequestLocation,
  };
  vouchersResult.current = {
    vouchers: [],
    isLoading: false,
    isCatalogComplete: false,
    error: null,
    retry: mockRetry,
  };
  routeSearch.current = {};
  routerIndex.current = 0;
  window.sessionStorage.clear();
  mockNavigate.mockReset();
  filteredResult.current = {
    data: undefined,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
  lastAppMenuProps.current = null;
  poolsResult.current = [];
  poolsResult.error = null;
  poolsResult.retry = vi.fn();
  poolsResult.enabled = [];
  profileRequests.current = 0;
  profileResult.current = {
    data: undefined,
    isPending: false,
    isError: false,
  };
});

describe("MarketPage location button", () => {
  it("writes and clears Credit without leaving the canonical map route", () => {
    authState.current = { ...authState.current, isAuthenticated: true };
    creditFeedback.current = true;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "control Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "control Credit clear" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit clear" }));

    expect(mockNavigate).toHaveBeenCalledTimes(4);
    const previous = { q: "food", creditable: false };
    for (const [index, [call]] of mockNavigate.mock.calls.entries()) {
      expect(call).toMatchObject({ to: "/", ...(index % 2 === 1 ? { replace: true } : {}) });
      expect(call.search(previous)).toEqual({
        q: "food",
        tab: "market",
        view: "map",
        creditable: index % 2 === 0 ? true : false,
      });
    }
  });

  it("opens and closes the map filter sheet through the shared shell", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Filter vouchers" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Close filters" }));
    expect(screen.queryByRole("dialog", { name: "Filter vouchers" })).toBeNull();
  });

  it.each([
    ["idle", "Use current location", false],
    ["requesting", "Finding location", true],
    ["denied", "Location denied", true],
    ["unavailable", "Location unavailable", true],
  ])("labels and enables the button for %s", (status, label, disabled) => {
    cameraResult.current = { ...cameraResult.current, locationStatus: status };
    renderPage();

    const button = screen.getByRole("button", { name: label }) as HTMLButtonElement;
    expect(button.disabled).toBe(disabled);
  });

  it("asks the camera hook for an explicit fix when pressed", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Use current location" }));
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });
});

describe("MarketPage guest entry", () => {
  it("puts the menu, the search field with its joined filters, and Sign in on one row", () => {
    renderPage();

    const menu = screen.getByRole("button", { name: "Open menu" });
    const search = screen.getByRole("button", { name: "Search the marketplace" });
    const filters = screen.getByRole("button", { name: "Filters" });
    const signIn = screen.getByRole("link", { name: "Sign in" });

    expect(menu.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filters.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The field and the filter button share one outlined box.
    expect(search.closest(".border")?.contains(filters)).toBe(true);
    expect(signIn.getAttribute("href")).toBe("/onboarding?step=welcome");
    expect(screen.queryByText("Sign in or sign up")).toBeNull();
  });

  it("does not request a private profile for guests, or hand the menu a location action", () => {
    renderPage();

    expect(profileRequests.current).toBe(0);
    expect(lastAppMenuProps.current).toEqual({});
  });
});

describe("MarketPage saved profile location", () => {
  const SAVED = { geoLat: -4.0435, geoLng: 39.6682 };
  const liveFix = { lat: -1.2, lng: 36.7 };

  it("opens on the saved location, ranked above a live fix, without moving the live marker", () => {
    cameraResult.current = {
      ...cameraResult.current,
      camera: { ...liveFix, zoom: 14, rank: 4 },
      userLocation: liveFix,
    };
    profileResult.current = { data: SAVED, isPending: false, isError: false };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual({ lat: -4.0435, lng: 39.6682, zoom: 14, rank: 3 });
    expect(lastMapProps.current?.userLocation).toEqual(liveFix);
  });

  it("stays on the saved location while the location button's request is pending", () => {
    profileResult.current = { data: SAVED, isPending: false, isError: false };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    fireEvent.click(screen.getByRole("button", { name: "Use current location" }));

    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
    expect(lastMapProps.current?.camera).toMatchObject({ lat: -4.0435, lng: 39.6682 });
  });

  it("moves to the live location once the location button yields an explicit fix", () => {
    const explicit: MarketCamera = { ...liveFix, zoom: 14, rank: 0 };
    cameraResult.current = { ...cameraResult.current, camera: explicit, userLocation: liveFix };
    profileResult.current = { data: SAVED, isPending: false, isError: false };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toBe(explicit);
  });

  it("keeps one camera identity across renders, so the map does not re-apply it", () => {
    profileResult.current = { data: SAVED, isPending: false, isError: false };
    const { rerender } = renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);
    const first = lastMapProps.current?.camera;

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MarketPage isAuthenticated locationOwner="0xabc" />
      </QueryClientProvider>,
    );

    expect(lastMapProps.current?.camera).toBe(first);
  });

  it.each([
    ["pending", { data: undefined, isPending: true, isError: false }],
    ["failed", { data: undefined, isPending: false, isError: true }],
    ["missing", { data: {}, isPending: false, isError: false }],
    ["out of range", { data: { geoLat: 91, geoLng: 10 }, isPending: false, isError: false }],
    [
      "not a number",
      { data: { geoLat: 10, geoLng: Number.NaN }, isPending: false, isError: false },
    ],
  ] as const)("falls back to the automatic camera when the saved location is %s", (_, result) => {
    const automatic: MarketCamera = { ...liveFix, zoom: 14, rank: 4 };
    cameraResult.current = { ...cameraResult.current, camera: automatic };
    profileResult.current = result;
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toBe(automatic);
  });

  it("ignores a profile location for a guest", () => {
    profileResult.current = { data: SAVED, isPending: false, isError: false };
    renderPage();

    expect(lastMapProps.current?.camera).toBeNull();
  });
});

describe("MarketPage data states", () => {
  it("contains no placeholder eatery, shop, or service data", () => {
    renderPage();
    expect(screen.queryByText(/Cosmo Bakery/)).toBeNull();
    expect(screen.queryByText(/Green Basket Market/)).toBeNull();
    expect(screen.queryByText(/Mtaa Repair Hub/)).toBeNull();
  });

  it("keeps the basemap mounted while vouchers load", () => {
    vouchersResult.current = { ...vouchersResult.current, isLoading: true };
    renderPage();

    expect(screen.getByTestId("market-map")).toBeTruthy();
  });

  it("shows an empty state without inventing markers", () => {
    vouchersResult.current = { ...vouchersResult.current, isCatalogComplete: true };
    renderPage();

    expect(screen.getByText(/no marketplace results/i)).toBeTruthy();
    expect(lastMapProps.current?.locations).toEqual([]);
  });

  it("offers a retry over the map when loading fails", () => {
    vouchersResult.current = { ...vouchersResult.current, error: new Error("network down") };
    renderPage();

    expect(screen.getByTestId("market-map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("passes real vouchers straight to the map", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { kind: "goods" }), voucher("2", { kind: "services" })],
    };
    renderPage();

    expect(lastMapProps.current?.locations).toHaveLength(2);
    expect(lastMapProps.current?.locations[0]?.kind).toBe("goods");
  });
});

function detailFor(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "1",
    chainId: 42220,
    address: "0xAbC0000000000000000000000000000000000123",
    name: "Priscilah Malii",
    symbol: "MALII",
    decimals: 6,
    ownerAddress: null,
    description: null,
    voucherUoa: "KSH",
    voucherValue: "10",
    locationName: null,
    lat: -1.29,
    lng: 36.82,
    email: null,
    website: null,
    phone: null,
    terms: null,
    iconUrl: "https://content.example/icon.jpg",
    bannerUrl: null,
    tags: [],
    kind: "goods",
    active: true,
    ...overrides,
  } as MarketVoucherDetail;
}

const LINKED = "0xAbC0000000000000000000000000000000000123";

describe("MarketPage pins", () => {
  it("opens a tapped voucher on its own page, from the market", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/vouchers/$voucherAddress",
      params: { voucherAddress: LINKED },
      search: { from: "market" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("selects the pin a link names, and requests no detail without one", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();
    expect(lastMapProps.current?.selectedLocationId).toBeNull();
    expect(detailRequests.current.every((address) => address === undefined)).toBe(true);
  });

  it("centres a shared link on its voucher and selects its pin, ahead of the saved location", () => {
    routeSearch.current = { voucher: LINKED };
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    detailResult.current = { data: detailFor({ lat: -3.63, lng: 39.85 }), isPending: false };
    profileResult.current = {
      data: { geoLat: -4.0435, geoLng: 39.6682 },
      isPending: false,
      isError: false,
    };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual({ lat: -3.63, lng: 39.85, zoom: 14, rank: 1 });
    expect(lastMapProps.current?.selectedLocationId).toBe("1");
    expect(detailRequests.current).toContain(LINKED);
  });

  it("clears a linked selection in place on a tap on empty map", () => {
    routeSearch.current = { voucher: LINKED, q: "art" };
    renderPage();

    act(() => lastMapProps.current?.onDeselect?.());

    const [call] = mockNavigate.mock.calls.at(-1) ?? [];
    expect(call).toMatchObject({ to: ".", replace: true });
    expect(call.search({ voucher: LINKED, q: "art" })).toEqual({ voucher: undefined, q: "art" });
  });

  it("does nothing on a tap on empty map with no selection", () => {
    renderPage();

    act(() => lastMapProps.current?.onDeselect?.());

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not render the obsolete Browse all action over the map", () => {
    renderPage();

    expect(screen.queryByRole("link", { name: "Browse all" })).toBeNull();
  });
});

describe("MarketPage restored camera", () => {
  const STORED = { owner: "0xabc", lat: -1.2, lng: 36.9, zoom: 16, fitKey: null };
  const restored = { lat: -1.2, lng: 36.9, zoom: 16, rank: 2, restore: { fitKey: null } };

  function store(index: number, owner = "0xabc") {
    window.sessionStorage.setItem(
      "clc.market-camera.v1",
      JSON.stringify({ ...STORED, owner, index }),
    );
  }

  it("gives Back to the same map its view, ahead of a voucher link", () => {
    store(3);
    routerIndex.current = 3;
    routeSearch.current = { voucher: LINKED };
    detailResult.current = { data: detailFor({ lat: -3.63, lng: 39.85 }), isPending: false };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual(restored);
  });

  it("lets a fresh link to a voucher win over the last view", () => {
    store(3);
    routerIndex.current = 5;
    routeSearch.current = { voucher: LINKED };
    detailResult.current = { data: detailFor({ lat: -3.63, lng: 39.85 }), isPending: false };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual({ lat: -3.63, lng: 39.85, zoom: 14, rank: 1 });
  });

  it("opens a fresh visit on the last view rather than the saved location", () => {
    store(3);
    routerIndex.current = 5;
    profileResult.current = {
      data: { geoLat: -4.0435, geoLng: 39.6682 },
      isPending: false,
      isError: false,
    };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual(restored);
  });

  it("ignores another person's view", () => {
    store(0, "0xdef");
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toBeNull();
  });

  it("still moves to an explicit fix from the location button", () => {
    store(0);
    const explicit: MarketCamera = { lat: -1.1, lng: 36.7, zoom: 14, rank: 0 };
    cameraResult.current = { ...cameraResult.current, camera: explicit };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toBe(explicit);
  });

  it("remembers the settled view with its history entry", () => {
    routerIndex.current = 4;
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        west: 36.8,
        south: -1.3,
        east: 37,
        north: -1.1,
        zoom: 15,
        lat: -1.2,
        lng: 36.9,
      }),
    );

    expect(JSON.parse(window.sessionStorage.getItem("clc.market-camera.v1") ?? "null")).toEqual({
      owner: "0xabc",
      index: 4,
      lat: -1.2,
      lng: 36.9,
      zoom: 15,
      fitKey: null,
    });
  });
});

describe("MarketPage pools", () => {
  const pool: MarketPoolLocation = {
    id: "pool:0x49d3e72becc7870cd9d1981d5f4ec8e1cb5394e2",
    name: "Mina G Pool",
    kind: "pool",
    markerIcon: null,
    markerColor: null,
    lat: -3.6457,
    lng: 39.85,
    locationName: "Mnarani, Kilifi, Kenya",
    address: "0x49D3E72BECC7870Cd9d1981d5F4eC8e1CB5394E2",
  };

  it("draws pools after the vouchers, so a stack keeps its voucher anchor", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    poolsResult.current = [pool];
    renderPage();

    expect(lastMapProps.current?.locations.map((location) => location.id)).toEqual(["1", pool.id]);
  });

  it("opens the tapped pool's page", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    poolsResult.current = [pool];
    renderPage();

    fireEvent.click(screen.getByTestId(`marker-${pool.id}`));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/pools/$poolAddress",
      params: { poolAddress: pool.address },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses the unified filtered map result instead of the separate pool catalog", () => {
    routeSearch.current = { q: "art" };
    poolsResult.current = [pool];
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucher("1")], tagFacets: null },
    };
    renderPage();

    expect(poolsResult.enabled.at(-1)).toBe(false);
    expect(lastMapProps.current?.locations.map((location) => location.id)).toEqual(["1"]);
  });

  it("offers Retry when the pools fail to load", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    poolsResult.error = new Error("pools are down");
    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load pools.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(poolsResult.retry).toHaveBeenCalledTimes(1);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it("puts the vouchers' failure first when both fail", () => {
    vouchersResult.current = { ...vouchersResult.current, error: new Error("network down") };
    poolsResult.error = new Error("pools are down");
    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Could not load vouchers.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});

describe("MarketPage viewport", () => {
  it("forwards settled map bounds to the voucher query", () => {
    renderPage();

    expect(typeof lastMapProps.current?.onViewportSettled).toBe("function");
  });

  it("hands the resolved camera to the map", () => {
    const camera: MarketCamera = { lat: -1.29, lng: 36.82, zoom: 14, rank: 1 };
    cameraResult.current = { ...cameraResult.current, camera };
    renderPage();

    expect(lastMapProps.current?.camera).toEqual(camera);
  });
});

describe("MarketPage filtering", () => {
  const voucherAt = (id: number, lat: number, lng: number): MarketVoucher => ({
    id: String(id),
    chainId: 42220,
    address: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Voucher ${id}`,
    symbol: `V${id}`,
    iconUrl: null,
    locationName: null,
    lat,
    lng,
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
  });

  it("draws the filtered set and never the unfiltered import", () => {
    routeSearch.current = { q: "art" };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucherAt(99, -4.05, 39.66)],
      isCatalogComplete: true,
    };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
    };

    render(<MarketPage />);

    expect(lastMapProps.current?.locations.map((location) => location.id)).toEqual(["1"]);
  });

  it("frames the filtered results", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      data: {
        vouchers: [voucherAt(1, -1.29, 36.82), voucherAt(2, -1.5, 37.1)],
        tagFacets: null,
      },
    };

    render(<MarketPage />);

    const fit = lastMapProps.current?.fitBounds;
    expect(fit).toMatchObject({ west: 36.82, east: 37.1, south: -1.5, north: -1.29 });
    expect(fit?.key).toContain("art");
  });

  it("produces degenerate bounds for a single match, for the map to cap", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
    };

    render(<MarketPage />);

    expect(lastMapProps.current?.fitBounds).toMatchObject({
      west: 36.82,
      east: 36.82,
      south: -1.29,
      north: -1.29,
    });
  });

  it("does not frame anything while a filter is still resolving", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
      isPlaceholderData: true,
    };

    render(<MarketPage />);

    expect(lastMapProps.current?.fitBounds).toBeNull();
  });

  it("does not frame anything when unfiltered", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucherAt(1, -1.29, 36.82)],
      isCatalogComplete: true,
    };

    render(<MarketPage />);

    expect(lastMapProps.current?.fitBounds).toBeNull();
  });

  it("shows the query in the search field and the tag count on the filter button", () => {
    routeSearch.current = { q: "art", tags: "Art,Food" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
    };

    render(<MarketPage />);

    expect(screen.getByRole("button", { name: /^Search the marketplace/ }).textContent).toBe(
      "Search the marketplace art",
    );
    expect(screen.getByRole("button", { name: "Filters" }).textContent).toContain("2");
    expect(screen.queryByRole("link", { name: "Edit filters" })).toBeNull();
  });

  it("distinguishes a filtered-empty map from an empty catalog", () => {
    routeSearch.current = { q: "zzzz" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [], tagFacets: null },
    };

    render(<MarketPage />);

    expect(screen.getByText("No marketplace results match this search.")).toBeTruthy();
    expect(screen.queryByText("No marketplace results to show yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("says nothing about matches while a cold filtered load is pending", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = { ...filteredResult.current, data: undefined };

    render(<MarketPage />);

    expect(screen.queryByText("No marketplace results match this search.")).toBeNull();
    expect(screen.queryByText("No marketplace results to show yet.")).toBeNull();
  });
});

describe("MarketPage notices", () => {
  it("shows one notice at a time, the Credit feedback first", () => {
    authState.current = { ...authState.current, isAuthenticated: true };
    creditFeedback.current = true;
    vouchersResult.current = { ...vouchersResult.current, error: new Error("network down") };

    render(<MarketPage />);

    expect(screen.getByTestId("credit-feedback")).toBeTruthy();
    expect(screen.queryByText("Could not load vouchers.")).toBeNull();
  });

  it("puts the list badges under the bar and no Map button over the map", () => {
    render(<MarketPage />);

    expect(screen.getByRole("link", { name: "Pools" }).getAttribute("href")).toBe(
      "/market?scope=pools",
    );
    expect(screen.queryByRole("link", { name: "Map" })).toBeNull();
  });
});

describe("MarketPage filter failures", () => {
  it("offers Clear rather than Retry for an invalid filter", () => {
    routeSearch.current = { tags: "NotATag" };
    filteredResult.current = {
      ...filteredResult.current,
      error: new BackendApiError(400, "tags contains a value outside the tag vocabulary", "E04"),
    };

    render(<MarketPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("These filters aren't valid.");
    expect(within(alert).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(within(alert).getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("offers no action at all for a rate limit", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      error: new BackendApiError(429, "rate limit exceeded"),
    };

    render(<MarketPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Too many searches");
    expect(within(alert).queryByRole("button")).toBeNull();
  });

  it("still offers Retry for a transient failure", () => {
    filteredResult.current = { ...filteredResult.current, error: null };
    vouchersResult.current = { ...vouchersResult.current, error: new Error("network down") };

    render(<MarketPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Could not load vouchers.");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
