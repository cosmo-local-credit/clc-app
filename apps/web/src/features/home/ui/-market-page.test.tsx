import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucher, MarketVoucherDetail } from "#/features/home/api/market-client";
import type { MarketCamera } from "./market-map";

type MapProps = {
  locations: MarketVoucher[];
  selectedLocationId: string | null;
  camera: MarketCamera | null;
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
} = vi.hoisted(() => ({
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
}));

vi.mock("#/features/home/hooks/use-market-camera", () => ({
  CAMERA_RANK: { explicit: 0, liveGps: 1, persistedGps: 2, ipCity: 3, countryDefault: 4 },
  useMarketCamera: () => cameraResult.current,
}));

vi.mock("#/features/home/hooks/use-market-vouchers", () => ({
  MARKET_MAP_PAGE_SIZE: 500,
  MIN_VIEWPORT_BBOX_ZOOM: 11,
  useMarketMapVouchers: () => vouchersResult.current,
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: (address: string | undefined) => {
    detailRequests.current.push(address);
    return detailResult.current;
  },
}));

// Real routing is covered by src/routes/-voucher-navigation.test.tsx, which
// drives an actual router over memory history. Here the page is unit tested, so
// Link only needs to resolve params into an href.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
      {...rest}
    >
      {children}
    </a>
  ),
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

    // The basemap must stay visible behind a non-blocking error.
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

    expect(screen.queryByRole("link")).toBeNull();
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

  // Replaces an earlier assertion that the card exposed no link. That was
  // correct while no voucher page existed; now the card is the way in.
  it("links the selected voucher to its page", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { address: "0xAbC0000000000000000000000000000000000123" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/vouchers/0xAbC0000000000000000000000000000000000123");
    // One tap target for the whole card, not a link nested inside a region.
    expect(link.querySelector("a")).toBeNull();
  });

  it("shows the symbol beside the name", () => {
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", symbol: "MALII" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link");
    expect(link.textContent).toContain("Priscilah Malii");
    expect(link.textContent).toContain("MALII");
  });

  // Selecting a marker is what warms the cache the voucher page then reads, so
  // the card must actually ask for the detail of the voucher that was tapped.
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
        iconUrl: "https://content.example/icon.jpg",
        bannerUrl: null,
        kind: "goods",
      },
    } as typeof detailResult.current;
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { symbol: "MALII" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link");
    expect(link.querySelector('img[src="https://content.example/icon.jpg"]')).not.toBeNull();
    expect(link.textContent).toContain("1 MALII = 10 KSH");
  });

  // Detail is a second request. The card must be readable the instant a marker
  // is tapped, from the catalog row the map already had.
  it("stays readable before detail resolves", () => {
    detailResult.current = { data: undefined, isPending: true };
    vouchersResult.current = {
      ...vouchersResult.current,
      vouchers: [voucher("1", { name: "Priscilah Malii", symbol: "MALII", kind: "goods" })],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("marker-1"));

    const link = screen.getByRole("link");
    expect(link.textContent).toContain("Priscilah Malii");
    expect(link.textContent).toContain("MALII");
    expect(link.textContent).toContain("Goods");
    // No image and no rate yet, but also no broken image and no empty rate line.
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
    expect(screen.getByRole("link")).toBeTruthy();

    vouchersResult.current = { ...vouchersResult.current, vouchers: [voucher("2")] };
    rerender(
      <QueryClientProvider client={client}>
        <MarketPage key="same" />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps 'Browse all' present without introducing a list", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /browse all/i })).toBeTruthy();
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

    // A few hundred metres away, rounded to the nearest ten metres.
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
    // An IP city or country default must not produce a distance label.
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
