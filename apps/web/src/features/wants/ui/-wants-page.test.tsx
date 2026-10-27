import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false, state: "guest" },
  navigate: vi.fn(),
  clear: vi.fn(),
  setTags: vi.fn(),
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  filter: {
    result: {
      ok: true,
      filter: {
        term: "",
        tags: [] as string[],
        tagMatch: "any" as const,
        vouchers: [],
        voucherMatch: "any" as const,
      },
    } as { ok: true; filter: Record<string, unknown> } | { ok: false },
    isDebouncing: false,
    isFiltered: false,
    clear: vi.fn(),
    setTags: vi.fn(),
  },
  credit: {
    enabled: false,
    blocksResults: false,
    poolRefs: undefined as undefined | Array<{ chainId: number; address: string }>,
  },
  query: {
    data: undefined as undefined | { pages: Array<Record<string, unknown>> },
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: () => mocks.query }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    children,
    to,
    search,
    ...props
  }: React.ComponentProps<"a"> & {
    to: string;
    search?:
      | Record<string, unknown>
      | ((previous: Record<string, unknown>) => Record<string, unknown>);
  }) => {
    const state = typeof search === "function" ? search({}) : search;
    const query = new URLSearchParams(
      Object.entries(state ?? {})
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    return (
      <a {...props} href={`${to}?${query}`}>
        {children}
      </a>
    );
  },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("@clc/api/features/wants/queries", () => ({ wantsInfiniteQueryOptions: () => ({}) }));
vi.mock("#/lib/api/wants", () => ({ wantsClient: {} }));
vi.mock("#/features/auth/hooks/use-storage-owner", () => ({ useStorageOwner: () => "guest" }));
vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => ({ lat: -1, lng: 36 }),
}));
vi.mock("#/features/home/hooks/use-market-filter", () => ({
  useMarketFilter: () => mocks.filter,
}));
vi.mock("#/features/home/hooks/use-creditable-browse", () => ({
  useCreditableBrowse: () => mocks.credit,
}));
vi.mock("#/components/nearby-catalog", () => ({
  useNearbyCatalog: () => ({
    nearby: false,
    bounds: [{ minLat: -2, minLng: 35, maxLat: 0, maxLng: 37 }],
  }),
  nearbyQueryPolicy: () => ({}),
}));
vi.mock("#/components/market-bar", () => ({
  MarketBar: ({ credit, filters }: { credit: React.ReactNode; filters: React.ReactNode }) => (
    <div>
      {credit}
      {filters}
    </div>
  ),
}));
vi.mock("#/components/catalog-filter-controls", () => ({
  CatalogFilterSheet: ({
    onApply,
    onOpenChange,
  }: {
    onApply: (tags: string[], match: string) => void;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onOpenChange(true)}>
        Open filters
      </button>
      <button type="button" onClick={() => onApply(["Repair"], "all")}>
        Apply filters
      </button>
    </div>
  ),
}));
vi.mock("#/components/creditable-browse-control", () => ({
  CreditableBrowseControl: ({
    part,
    onChange,
    onClear,
  }: {
    part: string;
    onChange: (enabled: boolean) => void;
    onClear: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange(true)}>
        {part} Credit on
      </button>
      <button type="button" onClick={onClear}>
        {part} Credit clear
      </button>
    </div>
  ),
}));
vi.mock("#/components/market-viewport-search-notice", () => ({
  MarketViewportSearchNotice: ({ query }: { query: string }) => <output>Notice {query}</output>,
}));
vi.mock("#/components/wants/want-row", () => ({
  WantRow: ({ want }: { want: { name: string } }) => <div>{want.name}</div>,
}));

import { WantsPage } from "./wants-page";

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.filter.result = {
    ok: true,
    filter: { term: "", tags: [], tagMatch: "any", vouchers: [], voucherMatch: "any" },
  };
  mocks.filter.isDebouncing = false;
  mocks.filter.isFiltered = false;
  mocks.filter.clear.mockReset();
  mocks.filter.setTags.mockReset();
  mocks.credit.enabled = false;
  mocks.credit.blocksResults = false;
  mocks.credit.poolRefs = undefined;
  mocks.query.data = undefined;
  mocks.query.isPending = false;
  mocks.query.isError = false;
  mocks.query.isFetching = false;
  mocks.query.isPlaceholderData = false;
  mocks.query.hasNextPage = false;
  mocks.query.isFetchingNextPage = false;
  mocks.query.refetch.mockReset();
  mocks.query.fetchNextPage.mockReset();
});

describe("Wants marketplace page", () => {
  it.each([false, true])("guides genuinely empty Wants (authenticated=%s)", (signedIn) => {
    mocks.auth.isAuthenticated = signedIn;
    mocks.query.data = { pages: [{ wants: [] }] };
    render(<WantsPage />);
    expect(screen.getByRole("link", { name: signedIn ? "Wallet" : "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View this location on the map" })).toBeTruthy();
  });

  it.each(["isFetching", "isPlaceholderData", "hasNextPage"] as const)(
    "does not guide an unsettled Wants %s",
    (state) => {
      mocks.query.data = { pages: [{ wants: [] }] };
      mocks.query[state] = true;
      render(<WantsPage />);
      expect(screen.queryByText(/No marketplace results/)).toBeNull();
    },
  );

  it("renders rows and paginates while preserving Credit and filter navigation", () => {
    mocks.query.data = {
      pages: [
        {
          wants: [{ id: "7", name: "Bicycle repair" }],
          tagFacets: [{ tag: "Repair", count: 1 }],
        },
      ],
    };
    mocks.query.hasNextPage = true;

    render(<WantsPage />);

    expect(screen.getByText("Bicycle repair")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.query.fetchNextPage).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.filter.setTags).toHaveBeenCalledWith(["Repair"], "all");
    fireEvent.click(screen.getByRole("button", { name: "control Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "control Credit clear" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit clear" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(4);
    const calls = mocks.navigate.mock.calls.map(
      ([options]) =>
        options as {
          search: (previous: Record<string, unknown>) => Record<string, unknown>;
        },
    );
    expect(calls[0]?.search({ q: "repair" })).toEqual({
      q: "repair",
      scope: "wants",
      creditable: true,
    });
    expect(calls[1]?.search({ q: "repair" })).toEqual({
      q: "repair",
      scope: "wants",
      creditable: undefined,
    });
    expect(calls[2]?.search({ q: "repair" })).toEqual({ q: "repair", creditable: true });
    expect(calls[3]?.search({ q: "repair" })).toEqual({ q: "repair", creditable: undefined });
  });

  it("shows loading and first-page failure states with Retry", () => {
    mocks.query.isPending = true;
    const view = render(<WantsPage />);
    expect(screen.getByText("Loading Wants…")).toBeTruthy();

    mocks.query.isPending = false;
    mocks.query.isError = true;
    view.rerender(<WantsPage />);
    expect(screen.getByText("Couldn't load Wants.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.query.refetch).toHaveBeenCalled();
  });

  it("clears invalid filters and valid filtered empty states", () => {
    mocks.filter.result = { ok: false };
    const view = render(<WantsPage />);
    expect(screen.getByText("These filters aren't valid.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.filter.clear).toHaveBeenCalledTimes(1);

    mocks.filter.result = {
      ok: true,
      filter: { term: "repair", tags: [], tagMatch: "any", vouchers: [], voucherMatch: "any" },
    };
    mocks.filter.isFiltered = true;
    mocks.query.data = { pages: [{ wants: [], tagFacets: [] }] };
    view.rerender(<WantsPage />);
    expect(screen.getByText("No Wants found.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.filter.clear).toHaveBeenCalledTimes(2);
  });

  it("keeps feedback available while Credit eligibility blocks results", () => {
    mocks.credit.enabled = true;
    mocks.credit.blocksResults = true;
    render(<WantsPage creditableSearch />);
    expect(screen.queryByText("No Wants found.")).toBeNull();
    expect(screen.getByRole("button", { name: "feedback Credit clear" })).toBeTruthy();
  });
});
