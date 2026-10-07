import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { NearbyCatalog, isWithinNearbyCatalog, useNearbyCatalog } from "./nearby-catalog";
import { useMarketMapVouchers } from "#/features/home/hooks/use-market-vouchers";
import { useReportsInfinite } from "#/features/home/hooks/use-reports";
import { useUserPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import {
  useFilteredMarketVouchers,
  useMarketFacetVocabulary,
} from "#/features/home/hooks/use-filtered-market-vouchers";
import { useReportFeed } from "#/features/home/hooks/use-filtered-reports";
import { usePoolCatalog } from "#/features/pools/hooks/use-filtered-pools";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import {
  CATALOG_VISIBILITY_STORAGE_KEY,
  DEFAULT_CATALOG_VISIBILITY,
  useCatalogVisibilityStore,
} from "#/features/home/state/catalog-visibility";

const state = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    isLoading: false,
    state: "authenticated",
    address: "0xaaa",
    chainId: 100,
    error: null,
    retry: vi.fn(),
  },
  profile: { data: { geoLat: 0, geoLng: 0 }, isPending: false, isError: false, refetch: vi.fn() },
  market: vi.fn(),
  pools: vi.fn(),
  reports: vi.fn(),
  filteredMarket: vi.fn(),
  filteredPools: vi.fn(),
  filteredReports: vi.fn(),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => state.auth }));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => state.profile }));
vi.mock("#/lib/api/market", () => ({
  marketClient: {
    getMarketVouchers: state.market,
    getFilteredMarketVouchers: state.filteredMarket,
  },
}));
vi.mock("#/lib/api/pools", () => ({
  poolsClient: { getPools: state.pools, getFilteredPools: state.filteredPools },
}));
vi.mock("#/lib/api/reports", () => ({
  reportsClient: { getReports: state.reports, getFilteredReports: state.filteredReports },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

beforeEach(() => {
  state.auth.isAuthenticated = true;
  state.auth.isLoading = false;
  state.auth.address = "0xaaa";
  state.profile.data = { geoLat: 0, geoLng: 0 };
  state.profile.isPending = false;
  state.profile.isError = false;
  window.localStorage.clear();
  useCatalogVisibilityStore.setState({ visibility: DEFAULT_CATALOG_VISIBILITY });
  state.market.mockReset().mockResolvedValue({ vouchers: [], receivedCount: 0, first: 0, last: 0 });
  state.pools.mockReset().mockResolvedValue({ pools: [], receivedCount: 0 });
  state.reports.mockReset().mockResolvedValue({ reports: [] });
  state.filteredMarket
    .mockReset()
    .mockResolvedValue({ vouchers: [], receivedCount: 0, tagFacets: [] });
  state.filteredPools
    .mockReset()
    .mockResolvedValue({ pools: [], receivedCount: 0, tagFacets: [], voucherFacets: [] });
  state.filteredReports
    .mockReset()
    .mockResolvedValue({ reports: [], tagFacets: [], voucherFacets: [] });
});

it("uses exact saved-location radii and lets Global include every coordinate", () => {
  expect(isWithinNearbyCatalog(undefined, { lat: 80, lng: 80 })).toBe(true);
  const filter = { lat: 0, lng: 0, radiusKm: 100 };
  expect(isWithinNearbyCatalog(filter, { lat: 0.5, lng: 0 })).toBe(true);
  expect(isWithinNearbyCatalog(filter, { lat: 2, lng: 0 })).toBe(false);
  expect(isWithinNearbyCatalog(filter, { lat: null, lng: null })).toBe(false);
});

it("filters nearby results to the selected distance", async () => {
  window.localStorage.setItem(CATALOG_VISIBILITY_STORAGE_KEY, "100");
  state.market.mockResolvedValue({
    vouchers: [
      { id: "near", name: "Near", lat: 0.5, lng: 0 },
      { id: "far", name: "Far", lat: 2, lng: 0 },
    ],
    receivedCount: 2,
    first: 2,
    last: 0,
  });
  mount();
  expect(await screen.findByText("Near")).toBeTruthy();
  expect(screen.queryByText("Far")).toBeNull();
  expect(screen.getByTestId("lists").getAttribute("data-scope")).toContain(":100");
});

it("Global bypasses profile and authenticated nearby filtering", async () => {
  window.localStorage.setItem(CATALOG_VISIBILITY_STORAGE_KEY, "global");
  state.auth.isLoading = true;
  state.profile.isError = true;
  mount();
  await waitFor(() => expect(state.market).toHaveBeenCalled());
  expect(state.market.mock.lastCall?.[0].nearby).toBeUndefined();
  expect(screen.getByTestId("lists").getAttribute("data-scope")).toBeNull();
  state.profile.isError = false;
});

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

function Lists() {
  const scope = useNearbyCatalog();
  const [initialScope] = useState(scope);
  const market = useMarketMapVouchers(null);
  useUserPoolsInfinite();
  useReportsInfinite();
  return (
    <div data-testid="lists" data-scope={scope} data-initial-scope={initialScope}>
      {market.vouchers.map((v) => (
        <span key={v.id}>{v.name}</span>
      ))}
    </div>
  );
}

function mount(children: ReactNode = <Lists />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (visible = true) => (
    <QueryClientProvider client={client}>
      {visible ? <NearbyCatalog>{children}</NearbyCatalog> : null}
    </QueryClientProvider>
  );
  return { ...render(tree()), tree, client };
}

async function advanceTime(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("reuses fresh lists on entry/focus/reconnect and removes unused data after five minutes", async () => {
  // Keep React microtasks real while advancing cache timestamps and timers.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
  const view = mount();
  await advanceTime(10);
  view.rerender(view.tree(false));
  await advanceTime(20_000);
  expect(view.client.getQueryCache().getAll().length).toBeGreaterThan(0);
  view.rerender(view.tree());
  await advanceTime(10);
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  await advanceTime(10);
  for (const request of [state.market, state.pools, state.reports]) {
    expect(request).toHaveBeenCalledTimes(1);
  }
  view.rerender(view.tree(false));
  await advanceTime(5 * 60_000 + 1);
  expect(view.client.getQueryCache().getAll()).toEqual([]);
});

it.each(["entry", "focus", "reconnect"])("refreshes stale lists on %s", async (event) => {
  // Keep React microtasks real while advancing cache timestamps and timers.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
  const view = mount();
  await advanceTime(90_000);
  // Passing staleTime alone must not start polling an open screen.
  for (const request of [state.market, state.pools, state.reports]) {
    expect(request).toHaveBeenCalledTimes(1);
  }
  if (event === "entry") {
    view.rerender(view.tree(false));
    await advanceTime(10);
    view.rerender(view.tree());
  } else {
    await act(async () => {
      if (event === "focus") {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      } else {
        onlineManager.setOnline(false);
        onlineManager.setOnline(true);
      }
    });
  }
  await advanceTime(10);
  for (const request of [state.market, state.pools, state.reports]) {
    expect(request).toHaveBeenCalledTimes(2);
  }
});

it("refreshes stale searches and facet counts on reconnect for all three catalogs", async () => {
  // Keep React microtasks real while advancing cache timestamps and timers.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
  const filter = {
    term: "local",
    tags: [],
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
  } as const;
  const controls: CatalogFilterControls = {
    ...filter,
    filter: { ...filter, tags: [], vouchers: [] },
    result: { ok: true, filter: { ...filter, tags: [], vouchers: [] } },
    isFiltered: true,
    isDebouncing: false,
    isAtTagLimit: false,
    setTerm: vi.fn(),
    toggleTag: vi.fn(),
    setTags: vi.fn(),
    setTagMatch: vi.fn(),
    setFacets: vi.fn(),
    clearTerm: vi.fn(),
    clear: vi.fn(),
  };
  const unfiltered = {
    isPending: false,
    error: null,
    retry: vi.fn(),
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  };
  function FilteredLists() {
    useFilteredMarketVouchers(controls.filter);
    useMarketFacetVocabulary(true);
    useReportFeed(controls, { ...unfiltered, reports: [] }, true);
    usePoolCatalog(controls, { ...unfiltered, pools: [] }, true);
    return null;
  }
  mount(<FilteredLists />);
  await advanceTime(90_000);
  for (const request of [state.filteredMarket, state.filteredPools, state.filteredReports]) {
    expect(request).toHaveBeenCalledTimes(2); // Search and facet vocabulary.
  }
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  await advanceTime(10);
  for (const request of [state.filteredMarket, state.filteredPools, state.filteredReports]) {
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls.every(([params]) => params.nearby === true)).toBe(true);
  }
});

it("all three screen lists request nearby results", async () => {
  mount();
  await waitFor(() => expect(state.market).toHaveBeenCalled());
  for (const request of [state.market, state.pools, state.reports]) {
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ nearby: true }),
      expect.any(AbortSignal),
    );
  }
});

it("drops old rows and local state immediately when profile location or account changes", async () => {
  state.market.mockResolvedValueOnce({
    vouchers: [{ id: "1", name: "Old place", lat: 0, lng: 0 }],
    receivedCount: 1,
    first: 1,
    last: 1,
  });
  const view = mount();
  await screen.findByText("Old place");
  state.market.mockImplementation(() => new Promise(() => {}));
  state.profile.data = { geoLat: 30, geoLng: 40 };
  view.rerender(view.tree());
  expect(screen.queryByText("Old place")).toBeNull();
  const scope = screen.getByTestId("lists").getAttribute("data-scope");
  expect(scope).toContain(":30:40");
  expect(screen.getByTestId("lists").getAttribute("data-initial-scope")).toBe(scope);
  state.auth.address = "0xbbb";
  view.rerender(view.tree());
  expect(screen.getByTestId("lists").getAttribute("data-scope")).toContain("0xbbb");
  expect(screen.queryByText("Old place")).toBeNull();
});

it("cancels a pending old-location request on a location change", async () => {
  let signal: AbortSignal | undefined;
  state.market.mockImplementation((_params, received: AbortSignal) => {
    signal ??= received;
    return new Promise(() => {});
  });
  const view = mount();
  await waitFor(() => expect(signal).toBeDefined());
  state.profile.data = { geoLat: 1, geoLng: 1 };
  await act(async () => view.rerender(view.tree()));
  expect(signal?.aborted).toBe(true);
});

it("loads public results for guests and remounts when signing in or out", async () => {
  state.auth.isAuthenticated = false;
  const view = mount();
  await waitFor(() => expect(state.market).toHaveBeenCalled());
  expect(screen.getByTestId("lists").getAttribute("data-scope")).toBeNull();
  for (const request of [state.market, state.reports]) {
    expect(request.mock.calls[0]?.[0].nearby).toBeUndefined();
  }
  state.auth.isAuthenticated = true;
  await act(async () => view.rerender(view.tree()));
  await waitFor(() => expect(state.market.mock.lastCall?.[0].nearby).toBe(true));
  expect(screen.getByTestId("lists").getAttribute("data-initial-scope")).toContain("nearby:");
  state.auth.isAuthenticated = false;
  await act(async () => view.rerender(view.tree()));
  expect(screen.getByTestId("lists").getAttribute("data-initial-scope")).toBeNull();
});

it("does not load catalogs while authentication is loading", () => {
  state.auth.isAuthenticated = false;
  state.auth.isLoading = true;
  mount();
  expect(screen.queryByTestId("lists")).toBeNull();
  expect(state.market).not.toHaveBeenCalled();
  expect(state.pools).not.toHaveBeenCalled();
  expect(state.reports).not.toHaveBeenCalled();
});
