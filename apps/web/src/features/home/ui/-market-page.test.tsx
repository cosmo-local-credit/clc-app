import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type { MarketVoucher, MarketVoucherDetail } from "@clc/api/features/market/client";
import type { MarketLocation } from "./market-data";
import type { MarketCamera } from "./market-map";
import type { MarketMapCluster } from "@clc/core/features/market-map/logic";

type MarketPoolLocation = MarketLocation & { kind: "pool"; address: `0x${string}` };

type MapProps = {
  locations: MarketLocation[];
  clusters?: unknown[];
  mode?: "standard" | "satellite";
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
  onUserPan?: () => void;
  bottomInset?: number;
  onViewportSettled?: (viewport: {
    center: { lat: number; lng: number };
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
    userInitiated: boolean;
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
  selection,
  poolsResult,
  discoveryArea,
  mapRequests,
  mapResourceSelection,
  catalogsResult,
  reportsResult,
  mapQueryState,
} = vi.hoisted(() => ({
  authState: { current: { isAuthenticated: false, isLoading: false, session: null } },
  creditFeedback: { current: false },
  poolsResult: {
    current: [] as MarketPoolLocation[],
    error: null as Error | null,
    retry: vi.fn(),
  },
  discoveryArea: {
    current: null as {
      owner: string;
      center: { lat: number; lng: number };
      zoom: number;
      boxes: readonly { minLng: number; minLat: number; maxLng: number; maxLat: number }[];
    } | null,
    setArea: vi.fn(),
    clearArea: vi.fn(),
  },
  mapRequests: {
    voucherBounds: [] as unknown[],
    unifiedBounds: [] as unknown[],
    unifiedEnabled: [] as boolean[],
    unifiedZoom: [] as number[],
  },
  mapQueryState: {
    clusters: [] as MarketMapCluster[],
    isFetching: false,
    isPlaceholderData: false,
  },
  mapResourceSelection: {
    current: ["voucher", "want"] as ("voucher" | "want" | "pool" | "catalog" | "post")[],
  },
  catalogsResult: {
    current: [] as MarketLocation[],
    error: null as Error | null,
    retry: vi.fn(),
  },
  reportsResult: {
    current: [] as MarketLocation[],
    error: null as Error | null,
    retry: vi.fn(),
  },
  selection: {
    voucher: null as `0x${string}` | null,
    calls: [] as [string, string?][],
    listeners: new Set<() => void>(),
    subscribe: (listener: () => void) => {
      selection.listeners.add(listener);
      return () => selection.listeners.delete(listener);
    },
    set: (voucher: `0x${string}` | null) => {
      selection.voucher = voucher;
      for (const listener of selection.listeners) listener();
    },
  },
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
      isResolvingInitialCamera: false,
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

vi.mock("#/components/nearby-catalog", () => ({
  useNearbyCatalog: () => undefined,
  nearbyQueryKey: <T extends readonly unknown[]>(key: T) => key,
  nearbyQueryPolicy: () => ({}),
  useMarketDiscoveryArea: () => ({
    area: discoveryArea.current,
    setArea: discoveryArea.setArea,
    clearArea: discoveryArea.clearArea,
  }),
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

vi.mock("#/features/home/hooks/use-market-map-resource-selection", () => ({
  MARKET_MAP_RESOURCE_KINDS: ["voucher", "want", "pool", "catalog", "post"],
  useMarketMapResourceSelection: () => ({
    selected: mapResourceSelection.current,
    allSelected: mapResourceSelection.current.length === 5,
    toggle: vi.fn(),
    toggleAll: vi.fn(),
  }),
}));

vi.mock("#/features/home/hooks/use-market-map", () => ({
  useMarketMap: (options: {
    bounds: unknown;
    zoom: number;
    enabled: boolean;
    kinds: ("voucher" | "want" | "pool" | "catalog" | "post")[];
    facets: boolean;
    filter: { term: string };
  }) => {
    mapRequests.unifiedBounds.push(options.bounds);
    mapRequests.unifiedEnabled.push(options.enabled);
    mapRequests.unifiedZoom.push(options.zoom);
    const filtered = options.filter.term !== "" || "tags" in routeSearch.current;
    const source = filtered
      ? (filteredResult.current.data?.vouchers ?? [])
      : vouchersResult.current.vouchers;
    const locations: Array<
      MarketLocation & {
        resourceKind: "voucher" | "want" | "pool" | "catalog" | "post";
        resourceId: string;
      }
    > = source.map((voucher) => ({
      ...voucher,
      resourceKind: "voucher" as const,
      resourceId: voucher.address,
    }));
    if (!filtered && options.kinds.includes("pool")) {
      locations.push(
        ...poolsResult.current.map((pool) => ({
          ...pool,
          resourceKind: "pool" as const,
          resourceId: pool.address,
        })),
      );
    }
    if (!filtered && options.kinds.includes("catalog")) {
      locations.push(
        ...catalogsResult.current.map((catalog) => ({
          ...catalog,
          resourceKind: "catalog" as const,
          resourceId: (catalog as MarketLocation & { catalogId: string }).catalogId,
        })),
      );
    }
    if (!filtered && options.kinds.includes("post")) {
      locations.push(
        ...reportsResult.current.map((post) => ({
          ...post,
          resourceKind: "post" as const,
          resourceId: (post as MarketLocation & { reportId: string }).reportId,
        })),
      );
    }

    const resourceError =
      vouchersResult.current.error ??
      (options.kinds.includes("pool") ? poolsResult.error : null) ??
      (options.kinds.includes("catalog") ? catalogsResult.error : null) ??
      (options.kinds.includes("post") ? reportsResult.error : null);
    const error = filtered ? filteredResult.current.error : resourceError;
    const ready = filtered
      ? filteredResult.current.data !== undefined
      : vouchersResult.current.isCatalogComplete ||
        locations.length > 0 ||
        mapQueryState.clusters.length > 0;
    const retry = filtered ? filteredResult.current.refetch : vouchersResult.current.retry;
    return {
      locations: options.enabled ? locations : [],
      clusters: options.enabled ? mapQueryState.clusters : [],
      tagFacets: options.enabled ? (filteredResult.current.data?.tagFacets ?? []) : [],
      error: options.enabled ? error : null,
      retry,
      retrying: options.enabled && mapQueryState.isFetching,
      isFetching: options.enabled && mapQueryState.isFetching,
      isPlaceholderData: mapQueryState.isPlaceholderData,
      isSettled:
        options.enabled &&
        ready &&
        !error &&
        !mapQueryState.isFetching &&
        !mapQueryState.isPlaceholderData,
      status: !options.enabled ? "disabled" : error ? "error" : ready ? "ready" : "loading",
    };
  },
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
    savedProfile: 2,
    liveGps: 3,
    persistedGps: 4,
    ipCity: 5,
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
    useMarketMapVouchers: (bounds: unknown, _perPage: unknown, enabled = true) => {
      mapRequests.voucherBounds.push(bounds);
      return enabled ? vouchersResult.current : { ...vouchersResult.current, vouchers: [] };
    },
  };
});

vi.mock("#/features/home/hooks/use-market-reports", () => ({
  useMarketMapReports: ({ enabled }: { enabled: boolean }) => ({
    reports: enabled ? reportsResult.current : [],
    tagFacets: [],
    error: enabled ? reportsResult.error : null,
    retry: reportsResult.retry,
    retrying: false,
  }),
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

// One selection for the page and its sheet, as the URL is for both.
vi.mock("#/lib/navigation/use-voucher-sheet-selection", () => ({
  useVoucherSheetSelection: () => {
    const voucher = useSyncExternalStore(selection.subscribe, () => selection.voucher);
    return {
      voucher,
      voucherTab: "offerings",
      open: (address: `0x${string}`) => {
        selection.calls.push(["open", address]);
        selection.set(address);
      },
      close: () => {
        selection.calls.push(["close"]);
        selection.set(null);
      },
    };
  },
}));

vi.mock("#/lib/navigation/use-want-sheet-selection", () => ({
  useWantSheetSelection: () => ({ want: null, open: vi.fn(), close: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => routeSearch.current,
  useNavigate: () => mockNavigate,
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
  return render(node, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function expectBoundsCover(
  value: unknown,
  expected: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  },
) {
  const bounds = value as Array<{
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  }>;
  expect(bounds).toHaveLength(1);
  expect(bounds[0]?.minLng).toBeLessThanOrEqual(expected.minLng);
  expect(bounds[0]?.minLat).toBeLessThanOrEqual(expected.minLat);
  expect(bounds[0]?.maxLng).toBeGreaterThanOrEqual(expected.maxLng);
  expect(bounds[0]?.maxLat).toBeGreaterThanOrEqual(expected.maxLat);
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
    isResolvingInitialCamera: false,
  };
  vouchersResult.current = {
    vouchers: [],
    isLoading: false,
    isCatalogComplete: false,
    error: null,
    retry: mockRetry,
  };
  routeSearch.current = {};
  selection.voucher = null;
  selection.calls = [];
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
  discoveryArea.current = null;
  discoveryArea.setArea.mockReset();
  discoveryArea.clearArea.mockReset();
  mapResourceSelection.current = ["voucher", "want"];
  mapRequests.voucherBounds = [];
  mapRequests.unifiedBounds = [];
  mapRequests.unifiedEnabled = [];
  mapRequests.unifiedZoom = [];
  mapQueryState.clusters = [];
  mapQueryState.isFetching = false;
  mapQueryState.isPlaceholderData = false;
  catalogsResult.current = [];
  catalogsResult.error = null;
  catalogsResult.retry.mockReset();
  reportsResult.current = [];
  reportsResult.error = null;
  reportsResult.retry.mockReset();
  profileRequests.current = 0;
  profileResult.current = {
    data: undefined,
    isPending: false,
    isError: false,
  };
});

describe("MarketPage location button", () => {
  it("shows only the location control and ignores a legacy Satellite preference", () => {
    window.localStorage.setItem("clc.market-map-mode", "satellite");
    renderPage();

    expect(screen.queryByRole("button", { name: "Satellite view" })).toBeNull();
    expect(screen.getByRole("button", { name: "Use current location" })).toBeTruthy();
    expect(lastMapProps.current?.mode).toBeUndefined();
    expect(window.localStorage.getItem("clc.market-map-mode")).toBe("satellite");
  });

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
    ["unavailable", "Use current location", false],
    ["error", "Use current location", false],
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

  it("allows a transient unavailable location to be retried", () => {
    cameraResult.current = { ...cameraResult.current, locationStatus: "unavailable" };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Use current location" }));
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });
});

describe("MarketPage guest entry", () => {
  it("waits for the IP-city camera before mounting or querying the map", () => {
    cameraResult.current = {
      ...cameraResult.current,
      camera: null,
      isResolvingInitialCamera: true,
    };

    renderPage();

    expect(screen.queryByTestId("market-map")).toBeNull();
    expect(mapRequests.unifiedBounds.length).toBeGreaterThan(0);
    expect(mapRequests.unifiedEnabled.at(-1)).toBe(false);
    expect(lastMapProps.current).toBeNull();
  });

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
      camera: { ...liveFix, zoom: 14, rank: 3 },
      userLocation: liveFix,
    };
    profileResult.current = { data: SAVED, isPending: false, isError: false };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual({ lat: -4.0435, lng: 39.6682, zoom: 14, rank: 2 });
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

    rerender(<MarketPage isAuthenticated locationOwner="0xabc" />);

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
    const automatic: MarketCamera = { ...liveFix, zoom: 14, rank: 3 };
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
  it("does not show an empty notice over a cluster-only response", () => {
    mapQueryState.clusters = [
      {
        type: "cluster",
        id: "cluster:8:1:2",
        lat: -3.68,
        lng: 39.83,
        count: 6,
        kinds: { voucher: 5, want: 1 },
        expansionZoom: 16,
      },
    ];
    renderPage();

    expect(lastMapProps.current?.clusters).toEqual(mapQueryState.clusters);
    expect(screen.queryByText(/No marketplace results/)).toBeNull();
  });

  it.each(["fetching", "placeholder"])("suppresses empty notices for %s data", (state) => {
    vouchersResult.current.isCatalogComplete = true;
    mapQueryState.isFetching = state === "fetching";
    mapQueryState.isPlaceholderData = state === "placeholder";
    renderPage();

    expect(screen.queryByText(/No marketplace results/)).toBeNull();
  });

  it("shows delayed indeterminate progress and clears it as results arrive", () => {
    vi.useFakeTimers();
    try {
      mapQueryState.isFetching = true;
      const view = renderPage();
      expect(screen.queryByRole("progressbar")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(screen.queryByRole("progressbar")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      const progress = screen.getByRole("progressbar", { name: "Loading marketplace…" });
      expect(progress.getAttribute("aria-valuenow")).toBeNull();
      expect(screen.getByTestId("market-map")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Use current location" })).toBeTruthy();

      mapQueryState.isFetching = false;
      vouchersResult.current.vouchers = [voucher("1")];
      view.rerender(<MarketPage />);
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.queryByText(/No marketplace results/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

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

describe("MarketPage voucher card", () => {
  it("starts with no card open", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(lastMapProps.current?.selectedLocationId).toBeNull();
  });

  it("opens the tapped voucher's card through the URL selection", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", kind: "goods" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(selection.calls).toEqual([["open", "0xAbC0000000000000000000000000000000000123"]]);
    const card = screen.getByRole("dialog", { name: "Priscilah Malii" });
    expect(within(card).queryByText("Goods")).toBeNull();
    expect(within(card).getByRole("link", { name: "Get" })).toBeTruthy();
    expect(lastMapProps.current?.selectedLocationId).toBe("1");
  });

  it.each([
    ["goods", "Goods"],
    ["services", "Services"],
    ["voucher", "Voucher"],
  ] as const)("does not show the retired %s voucher-kind label %s", (kind, label) => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1", { kind })] };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(within(screen.getByRole("dialog")).queryByText(label)).toBeNull();
  });

  it("no longer leaves the map when the card is tapped", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(
      within(screen.getByRole("dialog")).queryByRole("link", { name: "Voucher 1" }),
    ).toBeNull();
  });

  it("shows the symbol beside the name", () => {
    detailResult.current = {
      data: detailFor({ name: "Priscilah Malii", symbol: "MALII" }),
      isPending: false,
    };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", symbol: "MALII" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(screen.getByRole("dialog").textContent).toContain("MALII");
  });

  it("requests detail for the selected voucher and nothing before that", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { address: "0xAbC0000000000000000000000000000000000123" })],
    };
    renderPage();

    expect(detailRequests.current.filter(Boolean)).toEqual([]);

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(detailRequests.current).toContain("0xAbC0000000000000000000000000000000000123");
  });

  it("adds the profile image but omits the retired exchange-rate line", () => {
    detailResult.current = { data: detailFor(), isPending: false };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { symbol: "MALII" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const card = screen.getByRole("dialog");
    expect(card.querySelector('img[src="https://content.example/icon.jpg"]')).not.toBeNull();
    expect(card.textContent).not.toContain("1 MALII = 10 KSH");
  });

  it("stays readable before detail resolves", () => {
    detailResult.current = { data: undefined, isPending: true };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", symbol: "MALII", kind: "goods" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const card = screen.getByRole("dialog", { name: "Priscilah Malii" });
    expect(card.textContent).toContain("Priscilah Malii");
    expect(card.textContent).not.toContain("Goods");
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).not.toContain("=");
  });

  it("keeps the card when a refreshed catalog no longer holds the voucher", () => {
    detailResult.current = { data: detailFor({ name: "Voucher 1" }), isPending: false };
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MarketPage />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("marker-1"));

    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("2", { address: "0xDef0000000000000000000000000000000000456" })],
    };
    rerender(
      <QueryClientProvider client={client}>
        <MarketPage />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Voucher 1" })).toBeTruthy();
    expect(lastMapProps.current?.selectedLocationId).toBeNull();
  });

  it("opens a deep-linked card before the catalog holds the voucher", () => {
    selection.voucher = "0xAbC0000000000000000000000000000000000123";
    detailResult.current = { data: detailFor(), isPending: false };
    renderPage();

    expect(screen.getByRole("dialog", { name: "Priscilah Malii" })).toBeTruthy();
  });

  it("closes through the URL selection", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();
    fireEvent.click(screen.getByTestId("marker-1"));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));

    expect(selection.calls.at(-1)).toEqual(["close"]);
  });

  it("centres a shared link on its voucher, ahead of the saved location", () => {
    selection.voucher = "0xAbC0000000000000000000000000000000000123";
    detailResult.current = { data: detailFor({ lat: -3.63, lng: 39.85 }), isPending: false };
    profileResult.current = {
      data: { geoLat: -4.0435, geoLng: 39.6682 },
      isPending: false,
      isError: false,
    };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual({ lat: -3.63, lng: 39.85, zoom: 14, rank: 1 });
  });

  it("keeps a camera already on the map when a card opens from a pin", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    detailResult.current = { data: detailFor(), isPending: false };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(lastMapProps.current?.camera).toBeNull();
  });

  it("moves the location button onto the card without exposing Satellite", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();
    expect(screen.queryByRole("link", { name: /browse all/i })).toBeNull();

    fireEvent.click(screen.getByTestId("marker-1"));

    const location = screen.getByRole("button", { name: "Use current location" });
    expect(screen.getByRole("dialog").contains(location)).toBe(true);
    expect(screen.queryByRole("button", { name: "Satellite view" })).toBeNull();
  });

  it("pads the map by the open card and drops the padding once it closes", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();
    expect(lastMapProps.current?.bottomInset).toBe(0);

    fireEvent.click(screen.getByTestId("marker-1"));
    // The voucher sheet keeps at least one third of the usable viewport visible.
    expect(lastMapProps.current?.bottomInset).toBe(Math.round(window.innerHeight / 3));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(lastMapProps.current?.bottomInset).toBe(0);
  });

  it("opens a card fully in one click and collapses it back to peek", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();
    fireEvent.click(screen.getByTestId("marker-1"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Expand" }));

    expect(within(dialog).getByRole("button", { name: "Collapse" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Collapse" }));

    expect(lastMapProps.current?.bottomInset).toBe(Math.round(window.innerHeight / 3));
  });

  it("closes the card on a tap on empty map", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();
    fireEvent.click(screen.getByTestId("marker-1"));

    act(() => lastMapProps.current?.onDeselect?.());

    expect(selection.calls.at(-1)).toEqual(["close"]);
  });

  it("does not render the obsolete Browse all action over the map", () => {
    renderPage();

    expect(screen.queryByRole("link", { name: /browse all/i })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
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
    mapResourceSelection.current = ["voucher", "pool"];
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    poolsResult.current = [pool];
    renderPage();

    expect(lastMapProps.current?.locations.map((location) => location.id)).toEqual(["1", pool.id]);
  });

  it("opens the tapped pool's page and leaves the voucher card closed", () => {
    mapResourceSelection.current = ["voucher", "pool"];
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    poolsResult.current = [pool];
    renderPage();

    fireEvent.click(screen.getByTestId(`marker-${pool.id}`));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/pools/$poolAddress",
      params: { poolAddress: pool.address },
    });
    expect(selection.calls).toEqual([]);
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

    expect(mapRequests.unifiedEnabled.at(-1)).toBe(true);
    expect(lastMapProps.current?.locations.map((location) => location.id)).toEqual(["1"]);
  });

  it("offers Retry when the pools fail to load", () => {
    mapResourceSelection.current = ["voucher", "pool"];
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    poolsResult.error = new Error("pools are down");
    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load complete marketplace results.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("puts the vouchers' failure first when both fail", () => {
    mapResourceSelection.current = ["voucher", "pool"];
    vouchersResult.current = { ...vouchersResult.current, error: new Error("network down") };
    poolsResult.error = new Error("pools are down");
    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load complete marketplace results.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});

describe("MarketPage Catalogs and Posts", () => {
  const catalog: MarketLocation = {
    id: "market:catalog:7",
    name: "Kilifi catalog",
    kind: "catalog",
    markerIcon: null,
    markerColor: null,
    lat: -3.63,
    lng: 39.85,
    locationName: "Kilifi",
    catalogId: "7",
  } as MarketLocation;
  const post: MarketLocation = {
    id: "market:post:11",
    name: "Market day",
    kind: "post",
    markerIcon: "event",
    markerColor: "pink",
    lat: -3.64,
    lng: 39.86,
    locationName: null,
    reportId: "11",
  } as MarketLocation;

  it("draws only the selected Catalog and Post resource pins", () => {
    mapResourceSelection.current = ["catalog", "post"];
    catalogsResult.current = [catalog];
    reportsResult.current = [post];

    renderPage();

    expect(lastMapProps.current?.locations).toEqual([
      expect.objectContaining(catalog),
      expect.objectContaining(post),
    ]);
    expect(lastMapProps.current?.locations.some((location) => location.kind === "voucher")).toBe(
      false,
    );
  });

  it("opens Catalog and Post pages with normal map history", () => {
    mapResourceSelection.current = ["catalog", "post"];
    catalogsResult.current = [catalog];
    reportsResult.current = [post];
    renderPage();

    fireEvent.click(screen.getByTestId(`marker-${catalog.id}`));
    fireEvent.click(screen.getByTestId(`marker-${post.id}`));

    expect(mockNavigate).toHaveBeenNthCalledWith(1, {
      to: "/catalogs/$catalogId",
      params: { catalogId: "7" },
    });
    expect(mockNavigate).toHaveBeenNthCalledWith(2, {
      to: "/posts/$reportId",
      params: { reportId: "11" },
    });
  });
});

describe("MarketPage distance", () => {
  it("shows a translated distance from a real GPS fix", () => {
    cameraResult.current = { ...cameraResult.current, realFix: { lat: -1.29, lng: 36.82 } };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { lat: -1.2921, lng: 36.8219 })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(screen.getByText(/^\d+ m$/)).toBeTruthy();
  });

  it("switches to kilometres for a distant voucher", () => {
    cameraResult.current = { ...cameraResult.current, realFix: { lat: -1.29, lng: 36.82 } };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { lat: -4.0435, lng: 39.6682 })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(screen.getByText(/km$/)).toBeTruthy();
  });

  it("never shows a distance without a real fix, falling back to the place name", () => {
    cameraResult.current = {
      ...cameraResult.current,
      realFix: null,
      camera: { lat: 12, lng: 34, zoom: 11, rank: 6 },
    };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { locationName: "C96, KEN" })],
    };
    renderPage();

    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: 12, lng: 34 },
        west: 33,
        south: 11,
        east: 35,
        north: 13,
        zoom: 11,
        userInitiated: false,
      }),
    );

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(screen.queryByText(/^\d+ m$/)).toBeNull();
    expect(screen.queryByText(/km$/)).toBeNull();
    expect(screen.getByText("C96, KEN")).toBeTruthy();
  });
});

describe("MarketPage viewport", () => {
  const savedBox = { minLng: 36, minLat: -2, maxLng: 37, maxLat: -1 } as const;

  it("restores the saved camera and prefetches a padded marker envelope", () => {
    discoveryArea.current = {
      owner: "guest",
      center: { lat: -1.5, lng: 36.5 },
      zoom: 10,
      boxes: [savedBox],
    };
    renderPage();

    expect(lastMapProps.current?.camera).toMatchObject({ lat: -1.5, lng: 36.5, zoom: 10 });
    expectBoundsCover(mapRequests.unifiedBounds.at(-1), {
      minLng: 35.8,
      minLat: -2.2,
      maxLng: 37.2,
      maxLat: -0.8,
    });
  });

  it("waits for a trustworthy initial camera to settle before loading bounded markers", () => {
    mapResourceSelection.current = ["voucher", "pool"];
    profileResult.current = {
      data: { geoLat: -1.5, geoLng: 36.5 },
      isPending: false,
      isError: false,
    };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toMatchObject({ lat: -1.5, lng: 36.5, rank: 2 });
    expect(mapRequests.unifiedEnabled.at(-1)).toBe(false);

    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: -1.5, lng: 36.5 },
        west: 36,
        south: -2,
        east: 37,
        north: -1,
        zoom: 10,
        userInitiated: false,
      }),
    );

    expect(mapRequests.unifiedEnabled.at(-1)).toBe(true);
    expectBoundsCover(mapRequests.unifiedBounds.at(-1), {
      minLng: 35.8,
      minLat: -2.2,
      maxLng: 37.2,
      maxLat: -0.8,
    });
  });

  it("persists exact settled bounds without refetching inside the marker envelope", () => {
    discoveryArea.current = {
      owner: "guest",
      center: { lat: -1.5, lng: 36.5 },
      zoom: 10,
      boxes: [savedBox],
    };
    renderPage();
    const original = mapRequests.unifiedBounds.at(-1);

    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: -1.5, lng: 36.55 },
        west: 36.1,
        south: -1.9,
        east: 36.9,
        north: -1.1,
        zoom: 10,
        userInitiated: true,
      }),
    );

    expect(discoveryArea.setArea).toHaveBeenCalledWith({
      center: { lat: -1.5, lng: 36.55 },
      zoom: 10,
      boxes: [{ minLng: 36.1, minLat: -1.9, maxLng: 36.9, maxLat: -1.1 }],
    });
    expect(mapRequests.unifiedBounds.at(-1)).toEqual(original);
  });

  it("tightens the fetch envelope when zooming back in from a regional view", () => {
    discoveryArea.current = {
      owner: "guest",
      center: { lat: -3.68, lng: 39.83 },
      zoom: 5,
      boxes: [{ minLng: 20, minLat: -20, maxLng: 50, maxLat: 10 }],
    };
    renderPage();
    const broad = mapRequests.unifiedBounds.at(-1);
    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: -3.68, lng: 39.83 },
        zoom: 16.5,
        west: 39.82,
        south: -3.69,
        east: 39.84,
        north: -3.67,
        userInitiated: true,
      }),
    );

    const narrow = mapRequests.unifiedBounds.at(-1) as Array<{ minLng: number; maxLng: number }>;
    expect(narrow).not.toEqual(broad);
    expect(narrow[0]!.maxLng - narrow[0]!.minLng).toBeLessThan(0.1);
    expect(mapRequests.unifiedZoom.at(-1)).toBe(16);
  });

  it.each([false, true])(
    "queries a saved close viewport immediately on refresh (authenticated=%s)",
    (authenticated) => {
      const bounds = { minLng: 39.82, minLat: -3.69, maxLng: 39.84, maxLat: -3.67 };
      discoveryArea.current = {
        owner: authenticated ? "0xabc" : "guest",
        center: { lat: -3.68, lng: 39.83 },
        zoom: 16,
        boxes: [bounds],
      };
      renderPage(
        <MarketPage isAuthenticated={authenticated} locationOwner={discoveryArea.current.owner} />,
      );

      expect(mapRequests.unifiedEnabled.at(-1)).toBe(true);
      expect(mapRequests.unifiedZoom.at(-1)).toBe(16);
      expectBoundsCover(mapRequests.unifiedBounds.at(-1), bounds);
      expect(discoveryArea.setArea).not.toHaveBeenCalled();
    },
  );

  it("moves the buffered marker query once the visible viewport leaves it", () => {
    discoveryArea.current = {
      owner: "guest",
      center: { lat: -1.5, lng: 36.5 },
      zoom: 10,
      boxes: [savedBox],
    };
    renderPage();

    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: 10.5, lng: 10.5 },
        west: 10,
        south: 10,
        east: 11,
        north: 11,
        zoom: 10,
        userInitiated: true,
      }),
    );

    expectBoundsCover(mapRequests.unifiedBounds.at(-1), {
      minLng: 9.8,
      minLat: 9.8,
      maxLng: 11.2,
      maxLat: 11.2,
    });
  });

  it("turns a settled coarse guest camera into the initial discovery viewport", () => {
    cameraResult.current = {
      ...cameraResult.current,
      camera: { lat: 0, lng: 20, zoom: 5, rank: 6 },
    };
    renderPage();
    const viewport = {
      center: { lat: 0, lng: 20 },
      west: 10,
      south: -10,
      east: 30,
      north: 10,
      zoom: 5,
    };

    act(() => lastMapProps.current?.onViewportSettled?.({ ...viewport, userInitiated: false }));
    expect(discoveryArea.setArea).toHaveBeenCalledOnce();
    expect(discoveryArea.setArea).toHaveBeenCalledWith({
      center: { lat: 0, lng: 20 },
      zoom: 5,
      boxes: [{ minLng: 10, minLat: -10, maxLng: 30, maxLat: 10 }],
    });
  });

  it("keeps a world camera Global until a visitor moves it", () => {
    renderPage();
    const viewport = {
      center: { lat: 0, lng: 20 },
      west: -20,
      south: -15,
      east: 60,
      north: 15,
      zoom: 2,
    };

    act(() => lastMapProps.current?.onViewportSettled?.({ ...viewport, userInitiated: false }));
    expect(discoveryArea.setArea).not.toHaveBeenCalled();

    act(() => lastMapProps.current?.onViewportSettled?.({ ...viewport, userInitiated: true }));
    expect(discoveryArea.setArea).toHaveBeenCalledOnce();
  });

  it("clears stale bounds when the settled camera is a genuine world view", () => {
    discoveryArea.current = {
      owner: "guest",
      center: { lat: -1.5, lng: 36.5 },
      zoom: 10,
      boxes: [savedBox],
    };
    renderPage();

    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: 0, lng: 0 },
        west: -180,
        south: -90,
        east: 180,
        north: 90,
        zoom: 1,
        userInitiated: true,
      }),
    );

    expect(discoveryArea.clearArea).toHaveBeenCalledOnce();
    expect(discoveryArea.setArea).not.toHaveBeenCalled();
  });

  it("keeps the settled world zoom when clearing the saved area", () => {
    discoveryArea.current = {
      owner: "guest",
      center: { lat: -1.5, lng: 36.5 },
      zoom: 10,
      boxes: [savedBox],
    };
    const view = renderPage();
    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: 0, lng: 0 },
        west: -180,
        south: -85,
        east: 180,
        north: 85,
        zoom: 1,
        userInitiated: true,
      }),
    );
    discoveryArea.current = null;
    view.rerender(<MarketPage />);

    expect(mapRequests.unifiedBounds.at(-1)).toEqual([]);
    expect(mapRequests.unifiedZoom.at(-1)).toBe(1);
  });

  it("resets the query envelope and zoom when the storage owner changes", () => {
    discoveryArea.current = {
      owner: "guest",
      center: { lat: -1.5, lng: 36.5 },
      zoom: 10,
      boxes: [savedBox],
    };
    const view = renderPage(<MarketPage locationOwner="guest" />);
    const ownerBounds = { minLng: 12, minLat: 40, maxLng: 13, maxLat: 41 };
    discoveryArea.current = {
      owner: "0xabc",
      center: { lat: 40.5, lng: 12.5 },
      zoom: 8,
      boxes: [ownerBounds],
    };
    view.rerender(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(mapRequests.unifiedZoom.at(-1)).toBe(8);
    expectBoundsCover(mapRequests.unifiedBounds.at(-1), ownerBounds);
  });

  it("splits an antimeridian viewport before persisting and querying it", () => {
    renderPage();

    act(() =>
      lastMapProps.current?.onViewportSettled?.({
        center: { lat: 0, lng: 180 },
        west: 179,
        south: -2,
        east: 181,
        north: 2,
        zoom: 8,
        userInitiated: true,
      }),
    );

    expect(discoveryArea.setArea).toHaveBeenCalledWith(
      expect.objectContaining({
        boxes: [
          { minLng: -180, minLat: -2, maxLng: -179, maxLat: 2 },
          { minLng: 179, minLat: -2, maxLng: 180, maxLat: 2 },
        ],
      }),
    );
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

    renderPage();

    expect(lastMapProps.current?.locations.map((location) => location.id)).toEqual(["1"]);
  });

  it("does not move the camera when filtered results change", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      data: {
        vouchers: [voucherAt(1, -1.29, 36.82), voucherAt(2, -1.5, 37.1)],
        tagFacets: null,
      },
    };

    renderPage();

    expect(lastMapProps.current?.fitBounds).toBeNull();
  });

  it("keeps the camera fixed for a single match", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
    };

    renderPage();

    expect(lastMapProps.current?.fitBounds).toBeNull();
  });

  it("does not frame anything while a filter is still resolving", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
      isPlaceholderData: true,
    };

    renderPage();

    expect(lastMapProps.current?.fitBounds).toBeNull();
  });

  it("does not frame anything when unfiltered", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucherAt(1, -1.29, 36.82)],
      isCatalogComplete: true,
    };

    renderPage();

    expect(lastMapProps.current?.fitBounds).toBeNull();
  });

  it("shows the query in the search field and the tag count on the filter button", () => {
    routeSearch.current = { q: "art", tags: "Art,Food" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
    };

    renderPage();

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

    renderPage();

    expect(screen.getByText("No marketplace results match this search.")).toBeTruthy();
    expect(screen.queryByText("No marketplace results to show yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("says nothing about matches while a cold filtered load is pending", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = { ...filteredResult.current, data: undefined };

    renderPage();

    expect(screen.queryByText("No marketplace results match this search.")).toBeNull();
    expect(screen.queryByText("No marketplace results to show yet.")).toBeNull();
  });
});

describe("MarketPage notices", () => {
  it("shows one notice at a time, the Credit feedback first", () => {
    authState.current = { ...authState.current, isAuthenticated: true };
    creditFeedback.current = true;
    vouchersResult.current = { ...vouchersResult.current, error: new Error("network down") };

    renderPage();

    expect(screen.getByTestId("credit-feedback")).toBeTruthy();
    expect(screen.queryByText("Could not load vouchers.")).toBeNull();
  });

  it("puts resource toggles under the bar without list-only Activity or Map controls", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "Vouchers" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Wants" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Pools" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.queryByRole("link", { name: "Activity" })).toBeNull();
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

    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("These filters aren't valid.");
    expect(within(alert).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(within(alert).getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("offers a manual Retry after automatic rate-limit recovery is exhausted", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      error: new BackendApiError(429, "rate limit exceeded"),
    };

    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Too many searches");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("still offers Retry for a transient failure", () => {
    filteredResult.current = { ...filteredResult.current, error: null };
    vouchersResult.current = { ...vouchersResult.current, error: new Error("network down") };

    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load complete marketplace results.");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
