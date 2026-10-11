import type { Offering } from "@clc/api/features/offerings/client";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  nearbyScope: undefined as string | undefined,
  nearbyFilter: undefined as { lat: number; lng: number; radiusKm: number } | undefined,
  filter: {
    result: {
      ok: true as boolean,
      filter: { term: "", tags: [] as string[], tagMatch: "any" as const },
      reason: "invalid",
    },
    isRestoringPreference: false,
    isDebouncing: false,
    clear: vi.fn(),
    applyFacetFilters: vi.fn(),
  },
  credit: {
    auth: { isAuthenticated: false, isLoading: false },
    parsed: { ok: true, enabled: null },
    enabled: false,
    verification: { status: "ready", pools: [], retry: vi.fn() },
    poolRefs: undefined as Array<{ chainId: number; address: string }> | undefined,
    blocksResults: false,
  },
  query: {
    data: undefined as
      | { pages: Array<{ offerings: Offering[]; tagFacets?: unknown[] }> }
      | undefined,
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  queryOptions: undefined as Record<string, unknown> | undefined,
  panelProps: undefined as Record<string, unknown> | undefined,
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useInfiniteQuery: (options: Record<string, unknown>) => {
      mocks.queryOptions = options;
      return mocks.query;
    },
  };
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock("#/components/nearby-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/components/nearby-catalog")>();
  return {
    ...actual,
    useNearbyCatalog: () => mocks.nearbyScope,
    useNearbyCatalogFilter: () => mocks.nearbyFilter,
  };
});
vi.mock("#/lib/navigation/use-persisted-catalog-filter", () => ({
  usePersistedCatalogFilter: () => mocks.filter,
}));
vi.mock("#/features/home/hooks/use-creditable-browse", () => ({
  useCreditableBrowse: () => mocks.credit,
}));
vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => ({ lat: 0, lng: 0 }),
}));
vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "guest",
}));
vi.mock("#/components/catalog-filter-controls", () => ({
  CatalogSearchField: () => <div data-testid="search" />,
  CatalogFilterSheet: () => <div data-testid="filters" />,
}));
vi.mock("#/components/creditable-browse-control", () => ({
  CreditableBrowseControl: () => <div data-testid="credit" />,
}));
vi.mock("#/components/marketplace-resource-navigation", () => ({
  MarketplaceResourceNavigation: () => <nav data-testid="navigation" />,
}));
vi.mock("#/components/offerings", () => ({
  OfferingsPanel: (props: Record<string, unknown>) => {
    mocks.panelProps = props;
    const query = props.query as typeof mocks.query;
    return (
      <div data-testid="offerings" data-next={String(query.hasNextPage)}>
        {query.data?.pages.flatMap((page) => page.offerings.map((offering) => offering.name))}
      </div>
    );
  },
}));

import { OffersPage } from "./offers-page";

function offering(id: string, lat: number): Offering {
  return {
    id,
    sourceId: null,
    voucherId: id,
    voucherAddress: `0x${id.padStart(40, "0")}` as `0x${string}`,
    voucherName: `Voucher ${id}`,
    voucherSymbol: `V${id}`,
    voucherUoa: null,
    priceInUnitOfAccount: null,
    voucherDecimals: 6,
    sellerAddress: "0x2222222222222222222222222222222222222222",
    name: `Offer ${id}`,
    commodityType: "GOOD",
    description: "",
    quantity: "1",
    unit: null,
    unitLabel: null,
    frequency: null,
    pricePerUnit: null,
    available: true,
    locationName: null,
    geoLat: null,
    geoLng: null,
    effectiveLocationName: `Place ${id}`,
    effectiveGeoLat: lat,
    effectiveGeoLng: 0,
    distanceMeters: null,
    imageUrl: null,
    tags: [],
  };
}

beforeEach(() => {
  mocks.nearbyScope = undefined;
  mocks.nearbyFilter = undefined;
  mocks.filter.result = {
    ok: true,
    filter: { term: "", tags: [], tagMatch: "any" },
    reason: "invalid",
  };
  mocks.filter.isRestoringPreference = false;
  mocks.filter.isDebouncing = false;
  mocks.credit.enabled = false;
  mocks.credit.poolRefs = undefined;
  mocks.credit.blocksResults = false;
  mocks.query.data = { pages: [{ offerings: [offering("1", 0.5)], tagFacets: [] }] };
  mocks.query.hasNextPage = false;
  mocks.queryOptions = undefined;
  mocks.panelProps = undefined;
});

describe("OffersPage", () => {
  it("renders global discovery with direct voucher navigation metadata", () => {
    render(<OffersPage />);

    expect(screen.getByText("Offer 1")).toBeTruthy();
    expect(mocks.queryOptions?.enabled).toBe(true);
    expect(mocks.panelProps).toMatchObject({
      showVoucher: true,
      showVoucherName: true,
      showLocation: true,
      directNavigation: true,
    });
  });

  it("filters a nearest-first result locally and stops pagination at the boundary", () => {
    mocks.nearbyScope = "nearby:account:100:0:0:100";
    mocks.nearbyFilter = { lat: 0, lng: 0, radiusKm: 100 };
    mocks.query.data = {
      pages: [{ offerings: [offering("1", 0.5), offering("2", 2)], tagFacets: [] }],
    };
    mocks.query.hasNextPage = true;

    render(<OffersPage />);

    expect(screen.getByText("Offer 1")).toBeTruthy();
    expect(screen.queryByText("Offer 2")).toBeNull();
    expect(screen.getByTestId("offerings").getAttribute("data-next")).toBe("false");
  });

  it("never renders an unfiltered list while Credit verification blocks it", () => {
    mocks.credit.enabled = true;
    mocks.credit.poolRefs = [];
    mocks.credit.blocksResults = true;

    render(<OffersPage creditableSearch />);

    expect(mocks.queryOptions?.enabled).toBe(false);
    expect(screen.getByText("No offers are available through your Credit pools.")).toBeTruthy();
    expect(screen.queryByTestId("offerings")).toBeNull();
  });

  it("keeps invalid catalog filters visible and suppresses results", () => {
    mocks.filter.result = {
      ok: false,
      filter: { term: "", tags: [], tagMatch: "any" },
      reason: "invalid",
    };

    render(<OffersPage />);

    expect(screen.getByRole("alert").textContent).toContain("filters aren't valid");
    expect(mocks.queryOptions?.enabled).toBe(false);
    expect(screen.queryByTestId("offerings")).toBeNull();
  });
});
