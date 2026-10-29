import type { MarketMapCluster, MarketMapMarker } from "@clc/core/features/market-map/logic";
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

vi.mock("#/lib/api/market-map", () => ({ marketMapClient: { list: mocks.mapList } }));
vi.mock("#/lib/api/market", () => ({
  marketClient: { getMarketVoucher: (...args: unknown[]) => mocks.voucher(...args) },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: mocks.auth.address }) }));
vi.mock("#/features/pools/hooks/use-creditable-pools", () => ({
  useCreditablePools: () => mocks.verification,
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

function marker(kind: MarketMapMarker["kind"], id: string, name: string): MarketMapMarker {
  return {
    type: "marker",
    id: `${kind}:${id}`,
    kind,
    resourceId: id,
    name,
    lat: -4.05,
    lng: 39.67,
    markerIcon: null,
    markerColor: null,
  };
}

function cluster(count: number): MarketMapCluster {
  return {
    type: "cluster",
    id: "cluster:1",
    lat: -4,
    lng: 39,
    count,
    kinds: { voucher: count },
    expansionZoom: 8,
  };
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
          creditableSearch={search.creditable}
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

describe("MarketMapDesk result count", () => {
  it("says it is loading, not zero, before any result set exists", async () => {
    mocks.mapList.mockImplementation(() => new Promise(() => {}));
    renderMap("/market?view=map");
    expect(await screen.findByText("Loading marketplace…")).toBeTruthy();
    expect(screen.queryByText(/^\d+ results$/)).toBeNull();
    expect(screen.queryByText("0 results")).toBeNull();
  });

  it("counts a result set, including a response that is only clusters", async () => {
    mocks.mapList.mockResolvedValue({ features: [cluster(42)] });
    renderMap("/market?view=map");
    expect(await screen.findByText("42 results")).toBeTruthy();
    expect(screen.getByText("Zoom in to see individual results.")).toBeTruthy();
    expect(screen.queryByText("0 results")).toBeNull();
  });

  it("counts markers and clusters together and lists the markers", async () => {
    mocks.mapList.mockResolvedValue({
      features: [marker("voucher", VOUCHER, "Bakery voucher"), cluster(9)],
    });
    renderMap("/market?view=map");
    expect(await screen.findByText("10 results")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bakery voucher/ })).toBeTruthy();
    expect(screen.queryByText("Zoom in to see individual results.")).toBeNull();
  });

  it("calls a genuinely empty result set zero", async () => {
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap("/market?view=map");
    expect(await screen.findByText("0 results")).toBeTruthy();
  });

  it("says Results unavailable, with Retry, when the first load fails, never 0 results", async () => {
    mocks.mapList
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ features: [marker("voucher", VOUCHER, "Bakery voucher")] });
    renderMap("/market?view=map");

    expect(await screen.findByText("Results unavailable")).toBeTruthy();
    expect(screen.queryByText("0 results")).toBeNull();
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("1 results")).toBeTruthy();
    expect(screen.queryByText("Results unavailable")).toBeNull();
  });
});

describe("MarketMapDesk retained results", () => {
  it("keeps the last good rows and count when a refinement fails, and says so with Retry", async () => {
    mocks.mapList
      .mockResolvedValueOnce({ features: [marker("voucher", VOUCHER, "Bakery voucher")] })
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ features: [marker("post", "p1", "Bread post")] });
    renderMap("/market?view=map");
    expect(await screen.findByText("1 results")).toBeTruthy();

    // A different selection is a new request; it fails.
    fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
    fireEvent.click(
      within(await screen.findByRole("group", { name: "Types on the map" })).getByRole("button", {
        name: "Posts",
      }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load complete marketplace results.");
    // The last good set is still what the column and the count show.
    expect(screen.getByText("1 results")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bakery voucher/ })).toBeTruthy();
    expect(screen.queryByText("Results unavailable")).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /Bread post/ })).toBeTruthy();
  });
});

describe("MarketMapDesk layers (the saved resource selection)", () => {
  it("exposes the five types, Posts included, and a toggle changes what the map requests", async () => {
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap("/market?view=map");
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want"]));

    fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
    const group = await screen.findByRole("group", { name: "Types on the map" });
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
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap("/market?view=map");
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want"]));

    fireEvent.click(screen.getByRole("button", { name: /Layers/ }));
    const group = await screen.findByRole("group", { name: "Types on the map" });
    fireEvent.click(within(group).getByRole("button", { name: "Vouchers" }));
    fireEvent.click(within(group).getByRole("button", { name: "Wants" }));

    // Nothing to draw: say so with a way back, and ask the server nothing.
    const calls = mocks.mapList.mock.calls.length;
    expect(
      await screen.findAllByText("Choose a resource type to show it on the map."),
    ).toBeTruthy();
    expect(screen.getByText("Results unavailable")).toBeTruthy();
    expect(mocks.mapList.mock.calls.length).toBe(calls);

    // The notice's own action resets to the defaults.
    fireEvent.click(screen.getAllByRole("button", { name: "Reset layers" })[0]!);
    await waitFor(() => expect(lastKinds()).toEqual(["voucher", "want"]));
  });

  it("has no layers for a category scope, which draws only its own resource", async () => {
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap("/market?scope=wants&view=map", { scope: "wants" });
    await waitFor(() => expect(lastKinds()).toEqual(["want"]));
    expect(screen.queryByRole("button", { name: /Layers/ })).toBeNull();
  });

  it("draws the same voucher markers for Offers and Vouchers: the map has no offering layer", async () => {
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap("/market?scope=offers&view=map", { scope: "offers" });
    await waitFor(() => expect(lastKinds()).toEqual(["voucher"]));
  });
});

describe("MarketMapDesk requested output (Get a voucher)", () => {
  it("restricts the pools map to the pools that can pay the voucher and shows the Get chip", async () => {
    mocks.mapList.mockResolvedValue({ features: [marker("pool", POOL_A, "Mombasa Bakers")] });
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
    mocks.mapList.mockResolvedValue({ features: [marker("pool", POOL_A, "Mombasa Bakers")] });
    const router = renderMap(`/market?scope=pools&view=map&out_voucher=${VOUCHER}`, {
      scope: "pools",
    });
    fireEvent.click(await screen.findByRole("button", { name: /Mombasa Bakers/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pools/${POOL_A}/swap`));
    expect(router.state.location.search).toMatchObject({ receive: VOUCHER });
  });

  it("opens the plain pool page when nothing was asked for", async () => {
    signIn();
    mocks.mapList.mockResolvedValue({ features: [marker("pool", POOL_A, "Mombasa Bakers")] });
    const router = renderMap("/market?scope=pools&view=map", { scope: "pools" });
    fireEvent.click(await screen.findByRole("button", { name: /Mombasa Bakers/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pools/${POOL_A}`));
  });

  it("gives an invalid output its own recovery and requests nothing", async () => {
    const router = renderMap("/market?scope=pools&view=map&out_voucher=nope", { scope: "pools" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This link contains an invalid output voucher.");
    expect(screen.getByText("Results unavailable")).toBeTruthy();
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
    const router = renderMap(
      `/market?scope=pools&view=map&creditable=true&out_voucher=${VOUCHER}`,
      { scope: "pools" },
    );
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

  it("offers a guest Sign in beside the map controls", async () => {
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap("/market?view=map");
    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/onboarding?step=welcome");
  });
});

function hrefOf(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
  return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
}

describe("MarketMapDesk navigation keeps the person's view", () => {
  it("keeps the Map view across scope tabs, with All being the home map", async () => {
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap("/market?scope=wants&view=map&q=bake", { scope: "wants" });
    await screen.findByText("0 results");

    const tabs = screen.getByRole("navigation", { name: "Marketplace" });
    const all = hrefOf(within(tabs).getByRole("link", { name: "All" }));
    expect(all.path).toBe("/");
    expect(all.search).toMatchObject({ tab: "market", view: "map", q: "bake" });
    for (const [name, scope] of [
      ["Offers", "offers"],
      ["Vouchers", "vouchers"],
      ["Pools", "pools"],
      ["Catalogs", "catalogs"],
    ] as const) {
      const target = hrefOf(within(tabs).getByRole("link", { name }));
      expect(target.path).toBe("/market");
      expect(target.search).toMatchObject({ scope, view: "map", q: "bake" });
    }
  });

  it("links List to the same scope and keeps the requested output on Pools", async () => {
    mocks.mapList.mockResolvedValue({ features: [] });
    renderMap(`/market?scope=pools&view=map&out_voucher=${VOUCHER}`, { scope: "pools" });
    await screen.findByText(/results$|Results unavailable/);
    const view = screen.getByRole("group", { name: "View" });
    expect(within(view).getByRole("link", { name: "Map" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(hrefOf(within(view).getByRole("link", { name: "List" })).search).toMatchObject({
      scope: "pools",
      view: "list",
      out_voucher: VOUCHER,
    });
  });
});
