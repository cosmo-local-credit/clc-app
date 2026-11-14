import type { MarketMapPoint } from "@clc/core/features/market-map/logic";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pickMarketplaceSearch } from "#/lib/navigation/marketplace-search";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

const VOUCHER = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";
const POOL_A = "0x00000000000000000000000000000000000000a1";
const MEMBER = "0x1111111111111111111111111111111111111111" as const;

const mocks = vi.hoisted(() => ({
  mapList: vi.fn(),
  mapFacets: vi.fn(),
  viewport: {
    rows: [] as MarketplaceResult[],
    total: 0,
    hasData: true,
    blocked: false,
    loading: false,
    retained: false,
    refreshing: false,
    error: null as Error | null,
    retry: vi.fn(),
    next: { hasMore: false, loading: false, failed: false, load: vi.fn() },
  },
  auth: {
    state: "guest" as "guest" | "authenticated",
    isAuthenticated: false,
    isLoading: false,
    address: undefined as `0x${string}` | undefined,
  },
  verification: {
    pools: [] as { chainId: number; address: string }[],
    status: "ready" as "loading" | "ready" | "error",
    isRefreshing: false,
    hasVerificationGaps: false,
    retry: vi.fn(),
    retrying: false,
  },
  availability: {
    pools: [] as { chainId: number; address: string }[],
    status: "ready" as "idle" | "loading" | "ready" | "error",
    isRefreshing: false,
    hasVerificationGaps: false,
    retry: vi.fn(),
    retrying: false,
  },
  voucher: vi.fn(),
}));

vi.mock("#/lib/api/market-map", () => ({
  marketMapClient: { points: mocks.mapList, facets: mocks.mapFacets },
}));
vi.mock("#/desktop/market/use-market-viewport-list", () => ({
  useMarketViewportList: () => mocks.viewport,
}));
vi.mock("#/lib/api/market", () => ({
  marketClient: { getMarketVoucher: (...args: unknown[]) => mocks.voucher(...args) },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: mocks.auth.address }) }));
vi.mock("#/lib/api/credit-router", () => ({
  creditRouterClient: {
    reach: () =>
      mocks.verification.status === "error"
        ? Promise.reject(new Error("Couldn't check creditable pools."))
        : mocks.verification.status === "loading"
          ? new Promise(() => {})
          : Promise.resolve({
              depth: 2,
              asOfBlock: 1,
              graphVersion: 1,
              stale: false,
              digest: `0x${"ab".repeat(32)}`,
              inputs: [],
              vouchers: [],
              pools: mocks.verification.pools.map((pool) => ({
                address: pool.address,
                minHops: 1,
              })),
            }),
  },
}));
vi.mock("#/features/pools/hooks/use-pool-output-availability", () => ({
  usePoolOutputAvailability: (voucher: unknown) =>
    voucher === undefined
      ? { ...mocks.availability, pools: [], status: "idle" }
      : mocks.availability,
}));
vi.mock("#/features/home/hooks/use-market-camera", () => ({
  CAMERA_RANK: { explicit: 0, selectedVoucher: 1, savedProfile: 2, liveGps: 3 },
  REAL_FIX_ZOOM: 14,
  useMarketCamera: () => ({
    camera: null,
    realFix: null,
    userLocation: null,
    locationStatus: "idle",
    requestLocation: () => {},
    isResolvingInitialCamera: false,
  }),
}));
vi.mock("#/components/nearby-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/components/nearby-catalog")>();
  return {
    ...actual,
    useMarketDiscoveryArea: () => ({ area: null, setArea: vi.fn(), clearArea: vi.fn() }),
  };
});
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: undefined, isPending: false }),
}));
vi.mock("#/features/home/ui/market-map.lazy", () => ({
  MarketMap: ({ locations }: { locations: { id: string }[] }) => (
    <div data-testid="map" data-markers={locations.length} />
  ),
}));
vi.mock("#/desktop/market/place-panel", () => ({ MarketPlacePanel: () => null }));

import { MarketMapDesk } from "./market-map-desk";

function marker(kind: MarketMapPoint["kind"], id: string, name: string): MarketMapPoint {
  return {
    kind,
    resourceId: id,
    name,
    lat: -4.05,
    lng: 39.67,
    markerIcon: null,
    markerColor: null,
  };
}

function viewportRow(
  kind: "voucher" | "want" | "pool" | "catalog" | "post",
  id: string,
  name: string,
): MarketplaceResult {
  return {
    kind,
    id,
    name,
    chainId: 100,
    address: kind === "voucher" || kind === "pool" ? id : null,
    voucherKind: kind === "voucher" ? "voucher" : undefined,
    tags: [],
    geoLat: -4.05,
    geoLng: 39.67,
  } as unknown as MarketplaceResult;
}

function renderMap(
  url: string,
  options: { scope?: "all" | "offers" | "vouchers" | "wants" | "pools" } = {},
) {
  const rootRoute = createRootRoute({ component: Outlet });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/market",
    validateSearch: (search: Record<string, unknown>) => pickMarketplaceSearch(search),
    component: function Market() {
      const search = useSearch({ strict: false }) as ReturnType<typeof pickMarketplaceSearch>;
      return (
        <MarketMapDesk
          isAuthenticated={mocks.auth.isAuthenticated}
          creditDepthSearch={search.creditDepth}
          outputVoucherSearch={search.out_voucher}
          scope={options.scope ?? "all"}
          creditRoute="market"
        />
      );
    },
  });
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      marketRoute,
      stub("/onboarding"),
      stub("/pools/$poolAddress"),
      stub("/pools/$poolAddress/swap"),
      stub("/catalogs/$catalogId"),
      stub("/posts/$reportId"),
    ]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const lastKinds = () => mocks.mapList.mock.calls.at(-1)?.[0]?.kinds as string[] | undefined;

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  mocks.mapList.mockReset();
  mocks.mapFacets.mockReset();
  mocks.mapFacets.mockResolvedValue({ tagFacets: [], postVoucherFacets: [], postPoolFacets: [] });
  mocks.viewport.rows = [];
  mocks.viewport.total = 0;
  mocks.viewport.hasData = true;
  mocks.viewport.blocked = false;
  mocks.viewport.loading = false;
  mocks.viewport.retained = false;
  mocks.viewport.refreshing = false;
  mocks.viewport.error = null;
  mocks.viewport.retry.mockReset();
  mocks.viewport.next.hasMore = false;
  mocks.viewport.next.loading = false;
  mocks.viewport.next.failed = false;
  mocks.viewport.next.load.mockReset();
  mocks.voucher.mockReset();
  mocks.voucher.mockResolvedValue({ address: VOUCHER, symbol: "BAKE", name: "Bakery" });
  mocks.auth.state = "guest";
  mocks.auth.isAuthenticated = false;
  mocks.auth.address = undefined;
  mocks.verification.pools = [];
  mocks.verification.status = "ready";
  mocks.availability.pools = [{ chainId: 100, address: POOL_A }];
  mocks.availability.status = "ready";
  mocks.availability.retry.mockReset();
});

function signIn() {
  mocks.auth.state = "authenticated";
  mocks.auth.isAuthenticated = true;
  mocks.auth.address = MEMBER;
}

function rememberResources(owner: string, kinds: string[]) {
  window.localStorage.setItem(
    ownerScopedKey(owner, "market-map-resources.v1"),
    JSON.stringify(kinds),
  );
}

describe("MarketMapDesk result count", () => {
  it("places zoom controls beneath the location control", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?view=map");

    const location = await screen.findByRole("button", { name: "Use current location" });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(
      location.compareDocumentPosition(zoomIn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(zoomIn.compareDocumentPosition(zoomOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says it is loading, not zero, before any result set exists", async () => {
    mocks.mapList.mockImplementation(() => new Promise(() => {}));
    mocks.viewport.hasData = false;
    mocks.viewport.loading = true;
    renderMap("/market?view=map");
    expect(await screen.findByText("Loading marketplace…")).toBeTruthy();
    expect(screen.queryByText(/Showing \d+ of \d+/)).toBeNull();
  });

  it("uses the exact viewport total, not the number of points the map holds", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    mocks.viewport.total = 42;
    renderMap("/market?view=map");
    expect(await screen.findByText("Showing 0 of 42 in this area")).toBeTruthy();
  });

  it("lists the area's resources and reports loaded versus total", async () => {
    mocks.mapList.mockResolvedValue({
      points: [marker("voucher", VOUCHER, "Bakery voucher")],
      truncated: false,
    });
    mocks.viewport.rows = [viewportRow("voucher", VOUCHER, "Bakery voucher")];
    mocks.viewport.total = 10;
    renderMap("/market?view=map");
    expect(await screen.findByText("Showing 1 of 10 in this area")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bakery voucher/ })).toBeTruthy();
    expect(screen.queryByText("Zoom in to see individual results.")).toBeNull();
  });

  it("calls a genuinely empty exact viewport zero", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?view=map");
    expect(await screen.findByText("Showing 0 of 0 in this area")).toBeTruthy();
  });

  it("keeps the exact-result recovery independent from retained map markers", async () => {
    mocks.mapList.mockResolvedValue({
      points: [marker("voucher", VOUCHER, "Bakery voucher")],
      truncated: false,
    });
    mocks.viewport.rows = [viewportRow("voucher", VOUCHER, "Bakery voucher")];
    mocks.viewport.total = 1;
    mocks.viewport.error = new Error("down");
    renderMap("/market?view=map");

    expect(await screen.findByText("Showing 1 of 1 in this area")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bakery voucher/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.viewport.retry).toHaveBeenCalledOnce();
  });
});

describe("MarketMapDesk retained results", () => {
  it("keeps exact viewport rows visible while their replacement refreshes", async () => {
    mocks.mapList.mockResolvedValue({
      points: [marker("voucher", VOUCHER, "Bakery voucher")],
      truncated: false,
    });
    mocks.viewport.rows = [viewportRow("voucher", VOUCHER, "Bakery voucher")];
    mocks.viewport.total = 7;
    mocks.viewport.retained = true;
    mocks.viewport.refreshing = true;
    renderMap("/market?view=map");
    expect(await screen.findByText("Showing 1 of 7 in this area")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bakery voucher/ })).toBeTruthy();
    expect(screen.getByLabelText("Loading marketplace…")).toBeTruthy();
  });
});

describe("MarketMapDesk exact-result interactions", () => {
  it("automatically requests the next exact page when its scroll sentinel becomes visible", async () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(next: IntersectionObserverCallback) {
          callback = next;
        }
        observe = observe;
        disconnect = vi.fn();
      },
    );
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    mocks.viewport.next.hasMore = true;
    renderMap("/market?view=map");
    await screen.findByText("Showing 0 of 0 in this area");
    expect(observe).toHaveBeenCalledOnce();

    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(mocks.viewport.next.load).toHaveBeenCalledOnce();
  });

  it("opens Voucher and Want rows while keeping marker hover selection interactive", async () => {
    mocks.mapList.mockResolvedValue({
      truncated: false,
      points: [
        marker("voucher", VOUCHER, "Bakery voucher"),
        marker("want", "12", "Need a bicycle"),
      ],
    });
    mocks.viewport.rows = [
      viewportRow("voucher", VOUCHER, "Bakery voucher"),
      viewportRow("want", "12", "Need a bicycle"),
    ];
    mocks.viewport.total = 2;
    const router = renderMap("/market?view=map");

    const voucher = await screen.findByRole("button", { name: /Bakery voucher/ });
    fireEvent.mouseEnter(voucher);
    fireEvent.mouseLeave(voucher);
    fireEvent.click(voucher);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ voucher: VOUCHER }));

    fireEvent.click(screen.getByRole("button", { name: /Need a bicycle/ }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ want: "12" }));
  });

  it("opens a Catalog row on its detail route", async () => {
    rememberResources("guest", ["catalog"]);
    mocks.mapList.mockResolvedValue({
      truncated: false,
      points: [marker("catalog", "23", "Coastal directory")],
    });
    mocks.viewport.rows = [viewportRow("catalog", "23", "Coastal directory")];
    mocks.viewport.total = 1;
    const router = renderMap("/market?view=map");

    fireEvent.click(await screen.findByRole("button", { name: /Coastal directory/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/catalogs/23"));
  });

  it("opens a Post row on its detail route", async () => {
    rememberResources("guest", ["post"]);
    mocks.mapList.mockResolvedValue({
      points: [marker("post", "34", "Market report")],
      truncated: false,
    });
    mocks.viewport.rows = [viewportRow("post", "34", "Market report")];
    mocks.viewport.total = 1;
    const router = renderMap("/market?view=map");

    fireEvent.click(await screen.findByRole("button", { name: /Market report/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/posts/34"));
  });
});

describe("MarketMapDesk layers (the saved resource selection)", () => {
  it("exposes the five types, Posts included, and a toggle changes what the map requests", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?view=map");
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want"]));

    fireEvent.click(screen.getByRole("button", { name: /Resources/ }));
    const group = await screen.findByRole("group", { name: "Resources on the map" });
    const toggles = within(group).getAllByRole("button");
    expect(toggles.map((toggle) => toggle.textContent)).toEqual([
      "Vouchers",
      "Wants",
      "Pools",
      "Catalogs",
      "Posts",
    ]);
    expect(
      within(group).getByRole("button", { name: "Vouchers" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(within(group).getByRole("button", { name: "Posts" }));
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want", "post"]));
    // The choice is the phone's saved selection: it persists under the same key.
    expect(
      JSON.parse(
        window.localStorage.getItem(ownerScopedKey("guest", "market-map-resources.v1")) ?? "null",
      ),
    ).toEqual(["voucher", "want", "post"]);
  });

  it("fixes an empty selection from the toolbar and from the notice", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?view=map");
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want"]));

    fireEvent.click(screen.getByRole("button", { name: /Resources/ }));
    const group = await screen.findByRole("group", { name: "Resources on the map" });
    fireEvent.click(within(group).getByRole("button", { name: "Vouchers" }));
    fireEvent.click(within(group).getByRole("button", { name: "Wants" }));

    // Nothing to draw: say so with a way back, and ask the server nothing.
    const calls = mocks.mapList.mock.calls.length;
    expect(
      await screen.findAllByText("Choose a resource type to show it on the map."),
    ).toBeTruthy();
    expect(screen.queryByText("Loading marketplace…")).toBeNull();
    expect(mocks.mapList.mock.calls.length).toBe(calls);

    // The notice's own action resets to the defaults, whose points are still
    // fresh in the cache: they come back without another request.
    const beforeReset = mocks.mapList.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Reset resources" })[0]!);
    await waitFor(() =>
      expect(screen.queryByText("Choose a resource type to show it on the map.")).toBeNull(),
    );
    expect(mocks.mapList.mock.calls.length).toBe(beforeReset);
  });

  it("ignores a legacy category scope and keeps the unified resource selector", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?scope=wants&view=map", { scope: "wants" });
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want"]));
    expect(screen.getByRole("button", { name: /Resources/ })).toBeTruthy();
  });

  it("does not let a legacy Offers scope replace the remembered resource selection", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?scope=offers&view=map", { scope: "offers" });
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want"]));
  });
});

describe("MarketMapDesk Credit", () => {
  it("lets the server resolve Credit for the signed-in wallet instead of sending pools", async () => {
    signIn();
    rememberResources(MEMBER, ["pool"]);
    mocks.verification.pools = [{ chainId: 100, address: POOL_A }];
    mocks.mapList.mockResolvedValue({
      points: [marker("pool", POOL_A, "Mombasa Bakers")],
      truncated: false,
    });
    renderMap("/market?scope=pools&view=map&creditDepth=2", { scope: "pools" });

    await waitFor(() =>
      expect(mocks.mapList.mock.calls.at(-1)?.[0]).toMatchObject({
        kinds: ["pool"],
        credit: { depth: 2, wallet: MEMBER, digest: `0x${"ab".repeat(32)}` },
      }),
    );
    expect(mocks.mapList.mock.calls.at(-1)?.[0].creditablePools).toBeUndefined();
  });

  it("never asks a guest's map for creditDepth", async () => {
    rememberResources("guest", ["pool"]);
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?scope=pools&view=map&creditDepth=1", { scope: "pools" });
    await screen.findAllByText("Sign in to browse results available through your Credit pools.");
    expect(mocks.mapList.mock.calls.every(([params]) => params.credit === undefined)).toBe(true);
  });
});

describe("MarketMapDesk requested output (Get a voucher)", () => {
  it("restricts the pools map to the pools that can pay the voucher and shows the Get chip", async () => {
    rememberResources("guest", ["pool"]);
    mocks.mapList.mockResolvedValue({
      points: [marker("pool", POOL_A, "Mombasa Bakers")],
      truncated: false,
    });
    renderMap(`/market?scope=pools&view=map&out_voucher=${VOUCHER}`, { scope: "pools" });

    expect(await screen.findByRole("button", { name: "Remove filter: Get BAKE" })).toBeTruthy();
    await waitFor(() =>
      expect(mocks.mapList.mock.calls.at(-1)?.[0]).toMatchObject({
        kinds: ["pool"],
        creditablePools: [{ chainId: 100, address: POOL_A }],
      }),
    );
  });

  it("sends a selected pool to its swap with the voucher on the receiving side, for a member", async () => {
    signIn();
    rememberResources(MEMBER, ["pool"]);
    mocks.mapList.mockResolvedValue({
      points: [marker("pool", POOL_A, "Mombasa Bakers")],
      truncated: false,
    });
    mocks.viewport.rows = [viewportRow("pool", POOL_A, "Mombasa Bakers")];
    mocks.viewport.total = 1;
    const router = renderMap(`/market?scope=pools&view=map&out_voucher=${VOUCHER}`, {
      scope: "pools",
    });
    fireEvent.click(await screen.findByRole("button", { name: /Mombasa Bakers/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pools/${POOL_A}/swap`));
    expect(router.state.location.search).toMatchObject({ receive: VOUCHER });
  });

  it("opens the plain pool page when nothing was asked for", async () => {
    signIn();
    rememberResources(MEMBER, ["pool"]);
    mocks.mapList.mockResolvedValue({
      points: [marker("pool", POOL_A, "Mombasa Bakers")],
      truncated: false,
    });
    mocks.viewport.rows = [viewportRow("pool", POOL_A, "Mombasa Bakers")];
    mocks.viewport.total = 1;
    const router = renderMap("/market?scope=pools&view=map", { scope: "pools" });
    fireEvent.click(await screen.findByRole("button", { name: /Mombasa Bakers/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pools/${POOL_A}`));
  });

  it("gives an invalid output its own recovery and requests nothing", async () => {
    mocks.viewport.hasData = false;
    mocks.viewport.blocked = true;
    const router = renderMap("/market?scope=pools&view=map&out_voucher=nope", { scope: "pools" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This link contains an invalid output voucher.");
    expect(screen.queryByText(/Showing \d+ of \d+/)).toBeNull();
    expect(mocks.mapList).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole("button", { name: "Clear filter" }));
    await waitFor(() => {
      expect((router.state.location.search as Record<string, unknown>).out_voucher).toBeUndefined();
    });
  });

  it("says no pool has the voucher, with Clear filters that also drop Credit and the output", async () => {
    signIn();
    mocks.availability.pools = [];
    mocks.verification.pools = [{ chainId: 100, address: POOL_A }];
    const router = renderMap(`/market?scope=pools&view=map&creditDepth=1&out_voucher=${VOUCHER}`, {
      scope: "pools",
    });
    expect(
      await screen.findByText("No creditable pools have this voucher available."),
    ).toBeTruthy();
    expect(mocks.mapList).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>;
      expect(search.creditable).toBeUndefined();
      expect(search.out_voucher).toBeUndefined();
    });
  });

  // The map chrome has no top bar, so a guest's way in sits over the map
  // itself rather than among the toolbar's chips.
  it("puts a guest's Sign in over the map, not in the results toolbar", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?view=map");
    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/onboarding?step=welcome");
    expect(screen.getByRole("group", { name: "View" }).contains(link)).toBe(false);
  });

  it("shows a member no Sign in over the map", async () => {
    signIn();
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?view=map");
    expect(await screen.findByRole("button", { name: "Filters" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});

function hrefOf(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
  return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
}

describe("MarketMapDesk navigation keeps the person's view", () => {
  it("removes duplicate scope tabs from the unified map", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap("/market?scope=wants&view=map&q=bake", { scope: "wants" });
    await screen.findByText("Showing 0 of 0 in this area");
    expect(screen.queryByRole("navigation", { name: "Marketplace" })).toBeNull();
  });

  it("links List to All from the unified map and drops Pool-only output narrowing", async () => {
    mocks.mapList.mockResolvedValue({ points: [], truncated: false });
    renderMap(`/market?scope=pools&view=map&out_voucher=${VOUCHER}`, { scope: "pools" });
    await screen.findByText(/Showing \d+ of \d+|Results unavailable/);
    const view = screen.getByRole("group", { name: "View" });
    expect(within(view).getByRole("link", { name: "Map" }).getAttribute("aria-current")).toBe(
      "page",
    );
    const list = hrefOf(within(view).getByRole("link", { name: "List" }));
    expect(list.search).toMatchObject({ scope: "all", view: "list" });
    expect(list.search.out_voucher).toBeUndefined();
  });
});
