import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type { MarketVoucher, MarketVoucherDetail } from "@clc/api/features/market/client";
import type { MarketCamera } from "./market-map";

type MapProps = {
  locations: MarketVoucher[];
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
  onViewportSettled?: (viewport: {
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
  }) => void;
};

const {
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
} = vi.hoisted(() => ({
  selection: {
    initial: null as `0x${string}` | null,
    calls: [] as [string, string?][],
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

vi.mock("#/features/home/hooks/use-market-camera", () => ({
  CAMERA_RANK: {
    explicit: 0,
    savedProfile: 1,
    liveGps: 2,
    persistedGps: 3,
    ipCity: 4,
    countryDefault: 5,
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
    return detailResult.current;
  },
}));

vi.mock("#/features/home/hooks/use-market-voucher-selection", () => ({
  useMarketVoucherSelection: () => {
    const [voucher, setVoucher] = useState(selection.initial);
    return {
      voucher,
      voucherTab: undefined,
      select: (address: `0x${string}`) => {
        selection.calls.push(["select", address]);
        setVoucher(address);
      },
      close: () => {
        selection.calls.push(["close"]);
        setVoucher(null);
      },
    };
  },
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
    ...overrides,
  };
}

function renderPage(node: ReactNode = <MarketPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
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
  selection.initial = null;
  selection.calls = [];
  mockNavigate.mockReset();
  filteredResult.current = {
    data: undefined,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
  lastAppMenuProps.current = null;
  profileRequests.current = 0;
  profileResult.current = {
    data: undefined,
    isPending: false,
    isError: false,
  };
});

describe("MarketPage location button", () => {
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
  it("floats the app menu at logical top-start and reserves room beside it for sign-in", () => {
    renderPage(<MarketPage onboardingBanner={<button type="button">Sign in or sign up</button>} />);

    expect(screen.getByTestId("app-menu").className).toContain("start-4");
    expect(screen.getByTestId("app-menu").className).toContain(
      "top-[calc(env(safe-area-inset-top)+1rem)]",
    );
    expect(
      screen.getByRole("button", { name: "Sign in or sign up" }).parentElement?.className,
    ).toContain("start-[4.75rem]");
    expect(
      screen.getByRole("button", { name: "Sign in or sign up" }).parentElement?.className,
    ).toContain("top-[calc(env(safe-area-inset-top)+1rem)]");
  });

  it("does not request a private profile for guests, or hand the menu a location action", () => {
    renderPage();

    expect(profileRequests.current).toBe(0);
    expect(lastAppMenuProps.current).toEqual({ className: expect.any(String) });
  });
});

describe("MarketPage saved profile location", () => {
  const SAVED = { geoLat: -4.0435, geoLng: 39.6682 };
  const liveFix = { lat: -1.2, lng: 36.7 };

  it("opens on the saved location, ranked above a live fix, without moving the live marker", () => {
    cameraResult.current = {
      ...cameraResult.current,
      camera: { ...liveFix, zoom: 14, rank: 2 },
      userLocation: liveFix,
    };
    profileResult.current = { data: SAVED, isPending: false, isError: false };
    renderPage(<MarketPage isAuthenticated locationOwner="0xabc" />);

    expect(lastMapProps.current?.camera).toEqual({ lat: -4.0435, lng: 39.6682, zoom: 14, rank: 1 });
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
    const automatic: MarketCamera = { ...liveFix, zoom: 14, rank: 2 };
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

    expect(screen.getByText(/no vouchers/i)).toBeTruthy();
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

describe("MarketPage preview", () => {
  it("starts with nothing selected", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    renderPage();

    expect(screen.queryByRole("link", { name: "Voucher 1" })).toBeNull();
  });

  it("shows the voucher name and translated kind after a marker tap", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", kind: "goods" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(screen.getAllByText("Priscilah Malii").length).toBeGreaterThan(0);
    expect(screen.getByText("Goods")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Priscilah Malii" }).className).toContain(
      "top-[calc(env(safe-area-inset-top)+4.75rem)]",
    );
  });

  it.each([
    ["goods", "Goods"],
    ["services", "Services"],
    ["voucher", "Voucher"],
  ] as const)("labels a %s voucher as %s", (kind, label) => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1", { kind })] };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("links the selected voucher to its page", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { address: "0xAbC0000000000000000000000000000000000123" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link", { name: "Voucher 1" });
    expect(link.getAttribute("href")).toBe("/vouchers/0xAbC0000000000000000000000000000000000123");
    expect(link.querySelector("a")).toBeNull();
  });

  it("shows the symbol beside the name", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", symbol: "MALII" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link", { name: "Priscilah Malii" });
    expect(link.textContent).toContain("Priscilah Malii");
    expect(link.textContent).toContain("MALII");
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

  it("adds the profile image and rate once detail arrives", () => {
    detailResult.current = {
      current: undefined,
      ...detailResult.current,
      data: {
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
      },
    } as typeof detailResult.current;
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { symbol: "MALII" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link", { name: "Voucher 1" });
    expect(link.querySelector('img[src="https://content.example/icon.jpg"]')).not.toBeNull();
    expect(link.textContent).toContain("1 MALII = 10 KSH");
  });

  it("stays readable before detail resolves", () => {
    detailResult.current = { data: undefined, isPending: true };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", symbol: "MALII", kind: "goods" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link", { name: "Priscilah Malii" });
    expect(link.textContent).toContain("Priscilah Malii");
    expect(link.textContent).toContain("MALII");
    expect(link.textContent).toContain("Goods");
    expect(link.querySelector("img")).toBeNull();
    expect(link.textContent).not.toContain("=");
  });

  it("clears the selection when a refreshed dataset drops the voucher", () => {
    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("1")] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MarketPage />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("marker-1"));
    expect(screen.getByRole("link", { name: "Voucher 1" })).toBeTruthy();

    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("2")] };
    rerender(
      <QueryClientProvider client={client}>
        <MarketPage key="same" />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("link", { name: "Voucher 1" })).toBeNull();
  });

  it("links Browse all to the marketplace list without rendering it over the map", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /browse all/i }).getAttribute("href")).toBe(
      "/?tab=market&view=list",
    );
    expect(screen.queryByRole("list")).toBeNull();
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
      camera: { lat: 12, lng: 34, zoom: 11, rank: 3 },
    };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { locationName: "C96, KEN" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    expect(screen.queryByText(/^\d+ m$/)).toBeNull();
    expect(screen.queryByText(/km$/)).toBeNull();
    expect(screen.getByText("C96, KEN")).toBeTruthy();
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

  it("shows the filter summary with a way to clear and a way to edit", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [voucherAt(1, -1.29, 36.82)], tagFacets: null },
    };

    render(<MarketPage />);

    expect(screen.getByText("\u201cart\u201d")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    const edit = screen.getByRole("link", { name: "Edit filters" });
    expect(edit.getAttribute("href")).toContain("view=list");
    expect(edit.getAttribute("href")).toContain("q=art");
  });

  it("hides the summary when nothing is filtered", () => {
    render(<MarketPage />);

    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("preserves the filter when leaving for the list", () => {
    routeSearch.current = { q: "art", tags: "Art" };

    render(<MarketPage />);

    const href = screen.getByRole("link", { name: "Browse all" }).getAttribute("href");
    expect(href).toContain("q=art");
    expect(href).toContain("tags=Art");
    expect(href).toContain("view=list");
  });

  it("distinguishes a filtered-empty map from an empty catalog", () => {
    routeSearch.current = { q: "zzzz" };
    filteredResult.current = {
      ...filteredResult.current,
      data: { vouchers: [], tagFacets: null },
    };

    render(<MarketPage />);

    expect(screen.getByText("No vouchers match this search.")).toBeTruthy();
    expect(screen.queryByText("No vouchers to show yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("says nothing about matches while a cold filtered load is pending", () => {
    routeSearch.current = { q: "art" };
    filteredResult.current = { ...filteredResult.current, data: undefined };

    render(<MarketPage />);

    expect(screen.queryByText("No vouchers match this search.")).toBeNull();
    expect(screen.queryByText("No vouchers to show yet.")).toBeNull();
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
