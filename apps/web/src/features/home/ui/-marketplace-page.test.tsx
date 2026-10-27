import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false, state: "guest" },
  nearbyScope: undefined as { nearby: boolean; scope?: string } | undefined,
  filter: {
    result: {
      ok: true as boolean,
      filter: { term: "", tags: [] as string[], tagMatch: "any" as const },
      reason: "invalid",
    },
    isFiltered: false,
    isRestoringPreference: false,
    isDebouncing: false,
    clear: vi.fn(),
    applyFacetFilters: vi.fn(),
  },
  credit: {
    enabled: false,
    poolRefs: undefined as Array<{ chainId: number; address: string }> | undefined,
    blocksResults: false,
  },
  query: {
    data: undefined as { pages: Array<{ results: MarketplaceResult[] }> } | undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  queryOptions: undefined as Record<string, unknown> | undefined,
  navigate: vi.fn(),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));

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
  Link: ({
    children,
    to,
    params,
    search,
    className,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    className?: string;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (href, [key, value]) => href.replace(`$${key}`, value),
      to,
    );
    const query = new URLSearchParams(search).toString();
    return (
      <a href={query ? `${path}?${query}` : path} className={className}>
        {children}
      </a>
    );
  },
}));
vi.mock("#/components/nearby-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/components/nearby-catalog")>();
  return {
    ...actual,
    useNearbyCatalog: () => mocks.nearbyScope,
  };
});
vi.mock("#/lib/navigation/use-persisted-catalog-filter", () => ({
  usePersistedCatalogFilter: () => mocks.filter,
}));
vi.mock("#/features/home/hooks/use-creditable-browse", () => ({
  useCreditableBrowse: () => mocks.credit,
}));
vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => null,
}));
vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "guest",
}));
vi.mock("#/components/market-bar", () => ({
  MarketBar: ({ current, credit }: { current: string; credit: ReactNode }) => (
    <div data-testid="market-bar" data-current={current}>
      {credit}
    </div>
  ),
}));
vi.mock("#/components/catalog-filter-controls", () => ({
  CatalogFilterSheet: () => null,
}));
vi.mock("#/components/creditable-browse-control", () => ({
  CreditableBrowseControl: ({
    part,
    onChange,
  }: {
    part: "control" | "feedback";
    onChange: (checked: boolean) => void;
  }) => (
    <button type="button" onClick={() => onChange(true)}>
      {part} Credit on
    </button>
  ),
}));

import { MarketplacePage } from "./marketplace-page";

const VOUCHER = "0x2222222222222222222222222222222222222222";
const POOL = "0x1111111111111111111111111111111111111111";
const OFFER_VOUCHER = "0x3333333333333333333333333333333333333333";

const base = {
  description: null,
  imageUrl: null,
  markerIcon: null,
  markerColor: null,
  voucherKind: null,
  locationName: null,
  geoLat: 0,
  geoLng: 0,
  distanceMeters: null,
  tags: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  voucherAddress: null,
  voucherName: null,
  voucherSymbol: null,
  voucherUoa: null,
  priceInUnitOfAccount: null,
  unit: null,
  poolCount: null,
  voucherCount: null,
};

function voucher(lat = 0): MarketplaceResult {
  return {
    ...base,
    kind: "voucher",
    id: "v1",
    name: "Bike voucher",
    chainId: 100,
    address: VOUCHER,
    symbol: "BIKE",
    voucherKind: "services",
    geoLat: lat,
    locationName: "Kibera",
    distanceMeters: 1_200,
    tags: ["Repair", "Transport", "Food", "Water"],
  };
}

function offering(): MarketplaceResult {
  return {
    ...base,
    kind: "offering",
    id: "o1",
    name: "Puncture repair",
    chainId: 100,
    address: OFFER_VOUCHER,
    symbol: null,
    voucherAddress: OFFER_VOUCHER,
    voucherName: "Repair voucher",
    voucherSymbol: "FIX",
    voucherUoa: null,
    priceInUnitOfAccount: null,
    unit: null,
  };
}

function pool(): MarketplaceResult {
  return {
    ...base,
    kind: "pool",
    id: "p1",
    name: "Kibera pool",
    chainId: 100,
    address: POOL,
    symbol: null,
    voucherCount: 4,
  };
}

function catalog(): MarketplaceResult {
  return {
    ...base,
    kind: "catalog",
    id: "42",
    name: "Market day",
    chainId: null,
    address: null,
    symbol: null,
    poolCount: 1,
    voucherCount: 3,
  };
}

function rowLink(name: string) {
  const link = screen.getByText(name).closest("a");
  if (!link) throw new Error(`no row for ${name}`);
  return link;
}

class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
}

beforeEach(() => {
  mocks.nearbyScope = undefined;
  mocks.filter.result = {
    ok: true,
    filter: { term: "", tags: [], tagMatch: "any" },
    reason: "invalid",
  };
  mocks.filter.isFiltered = false;
  mocks.filter.clear.mockReset();
  mocks.credit.enabled = false;
  mocks.credit.poolRefs = undefined;
  mocks.credit.blocksResults = false;
  mocks.query.data = { pages: [{ results: [offering(), voucher(), pool(), catalog()] }] };
  mocks.query.isPending = false;
  mocks.query.isFetching = false;
  mocks.query.isPlaceholderData = false;
  mocks.auth.isAuthenticated = false;
  mocks.query.isError = false;
  mocks.query.hasNextPage = false;
  mocks.query.isFetchingNextPage = false;
  mocks.query.isFetchNextPageError = false;
  mocks.query.fetchNextPage.mockReset();
  mocks.query.refetch.mockReset();
  mocks.queryOptions = undefined;
  mocks.navigate.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MarketplacePage", () => {
  it.each([false, true])(
    "guides an empty area to sign-in or Wallet (authenticated=%s)",
    (signedIn) => {
      mocks.auth.isAuthenticated = signedIn;
      mocks.query.data = { pages: [{ results: [] }] };
      render(<MarketplacePage />);
      const link = screen.getByRole("link", { name: signedIn ? "Wallet" : "Sign in" });
      expect(link.getAttribute("href")).toBe(
        signedIn ? "/?tab=wallet" : "/onboarding?step=signin&redirect=%2F%3Ftab%3Dwallet",
      );
    },
  );

  it.each(["isFetching", "isPlaceholderData", "hasNextPage"] as const)(
    "waits before guiding an empty %s response",
    (state) => {
      mocks.query.data = { pages: [{ results: [] }] };
      mocks.query[state] = true;
      render(<MarketplacePage />);
      expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    },
  );

  it("lists every kind in one panel, each opening its own page", () => {
    render(<MarketplacePage />);

    expect(screen.getByTestId("market-bar").getAttribute("data-current")).toBe("all");
    const list = screen.getByRole("region", { name: "Marketplace" });
    expect(within(list).getAllByRole("link")).toHaveLength(4);

    expect(rowLink("Puncture repair").getAttribute("href")).toBe(
      `/vouchers/${OFFER_VOUCHER}?from=market`,
    );
    expect(rowLink("Bike voucher").getAttribute("href")).toBe(`/vouchers/${VOUCHER}?from=market`);
    expect(rowLink("Kibera pool").getAttribute("href")).toBe(`/pools/${POOL}`);
    expect(rowLink("Market day").getAttribute("href")).toBe("/catalogs/42");

    expect(rowLink("Puncture repair").textContent).toContain("Offer");
    expect(rowLink("Puncture repair").textContent).toContain("FIX");
    expect(rowLink("Puncture repair").textContent).toContain("Repair voucher");
    expect(rowLink("Bike voucher").textContent).toContain("Voucher");
    expect(rowLink("Bike voucher").textContent).toContain("Kibera · 1.2 km");
    expect(rowLink("Bike voucher").textContent).toContain("+1");
    expect(rowLink("Kibera pool").textContent).toContain("Pool");
    expect(rowLink("Market day").textContent).toContain("Catalog");
  });

  it("asks for every kind with the search, its tags and the Credit pools", () => {
    mocks.filter.result = {
      ok: true,
      filter: { term: "bike", tags: ["Repair"], tagMatch: "any" },
      reason: "invalid",
    };
    mocks.credit.enabled = true;
    mocks.credit.poolRefs = [{ chainId: 100, address: POOL }];

    render(<MarketplacePage creditableSearch />);

    expect(mocks.queryOptions?.enabled).toBe(true);
    const key = (mocks.queryOptions?.queryKey as unknown[] | undefined)?.[3];
    expect(key).toMatchObject({
      perPage: 20,
      q: "bike",
      tags: ["Repair"],
      kinds: [],
      facets: true,
      nearby: false,
      pools: [`100:${POOL}`],
    });
  });

  it("writes Credit to the open list from both controls", () => {
    render(<MarketplacePage />);

    fireEvent.click(screen.getByRole("button", { name: "control Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit on" }));

    const [control, feedback] = mocks.navigate.mock.calls.map(([call]) => call);
    const previous = { scope: "all", q: "food" };
    expect(control).toMatchObject({ to: "/market" });
    expect(control.search(previous)).toEqual({ ...previous, creditable: true });
    expect(feedback).toMatchObject({ to: "." });
    expect(feedback.search(previous)).toEqual({ ...previous, creditable: true });
  });

  it("renders the complete server-bounded page and preserves pagination", () => {
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
    mocks.nearbyScope = { nearby: true, scope: "nearby:account:100:0:0:100" };
    mocks.query.data = { pages: [{ results: [voucher(0.5), { ...pool(), geoLat: 5 }] }] };
    mocks.query.hasNextPage = true;

    render(<MarketplacePage />);

    expect(screen.getByText("Bike voucher")).toBeTruthy();
    expect(screen.getByText("Kibera pool")).toBeTruthy();
    expect(mocks.query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("keeps paging a guest's Global result", () => {
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
    mocks.nearbyScope = { nearby: false };
    mocks.query.data = { pages: [{ results: [{ ...pool(), geoLat: 8 }] }] };
    mocks.query.hasNextPage = true;

    render(<MarketplacePage />);

    expect(screen.getByText("Kibera pool")).toBeTruthy();
    expect(screen.queryByText("No marketplace results found.")).toBeNull();
    expect(mocks.query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("offers Retry instead of paging again after the next page fails", () => {
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
    mocks.query.hasNextPage = true;
    mocks.query.isError = true;
    mocks.query.isFetchNextPageError = true;

    render(<MarketplacePage />);

    expect(screen.getByText("Bike voucher")).toBeTruthy();
    expect(mocks.query.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));
    expect(mocks.query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("never asks while Credit blocks results, and says when no pool is creditable", () => {
    mocks.credit.enabled = true;
    mocks.credit.poolRefs = [];
    mocks.credit.blocksResults = true;

    render(<MarketplacePage creditableSearch />);

    expect(mocks.queryOptions?.enabled).toBe(false);
    expect(
      screen.getByText("No marketplace results are available through your Credit pools."),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Marketplace" })).toBeNull();
  });

  it("shows invalid filters without a list or a loading state", () => {
    mocks.filter.result = {
      ok: false,
      filter: { term: "", tags: [], tagMatch: "any" },
      reason: "invalid",
    };
    mocks.query.isPending = true;

    render(<MarketplacePage />);

    expect(screen.getByRole("alert").textContent).toContain("filters aren't valid");
    expect(mocks.queryOptions?.enabled).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retries a failed first page", () => {
    mocks.query.data = undefined;
    mocks.query.isError = true;

    render(<MarketplacePage />);

    expect(screen.getByRole("alert").textContent).toContain("Couldn't load marketplace results.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
  });

  it("clears a search that matches nothing", () => {
    mocks.query.data = { pages: [{ results: [] }] };
    mocks.filter.isFiltered = true;

    render(<MarketplacePage />);

    expect(screen.getByText("No marketplace results found.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.filter.clear).toHaveBeenCalledTimes(1);
  });
});
