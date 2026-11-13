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
import type { MarketListScope } from "#/lib/navigation/marketplace-search";

const VOUCHER = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";
const POOL_A = "0x00000000000000000000000000000000000000a1";
const POOL_B = "0x00000000000000000000000000000000000000b2";
const MEMBER = "0x1111111111111111111111111111111111111111" as const;

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  offers: vi.fn(),
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
  distanceOrigin: null as { lat: number; lng: number } | null,
}));

vi.mock("#/lib/api/marketplace", () => ({ marketplaceClient: { list: mocks.list } }));
vi.mock("#/lib/api/offerings", () => ({ offeringsClient: { getOfferings: mocks.offers } }));
vi.mock("#/lib/api/market", () => ({
  marketClient: { getMarketVoucher: (...args: unknown[]) => mocks.voucher(...args) },
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
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
vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => mocks.distanceOrigin,
}));
vi.mock("#/desktop/market/place-panel", () => ({ MarketPlacePanel: () => null }));

import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { GUEST_STORAGE_OWNER, ownerScopedKey } from "#/lib/storage/owner-tier-key";
import { MarketListDesk } from "./market-list-desk";

function pool(address: string, name: string): MarketplaceResult {
  return {
    kind: "pool",
    id: address,
    name,
    chainId: 100,
    address,
    voucherCount: 3,
    locationName: "Mombasa",
    geoLat: -4.05,
    geoLng: 39.67,
    tags: [],
  } as unknown as MarketplaceResult;
}

const page = (results: MarketplaceResult[], nextCursor: string | null = null) => ({
  results,
  nextCursor,
  tagFacets: [],
});

function renderList(url: string, scope: MarketListScope = "pools") {
  const rootRoute = createRootRoute({ component: Outlet });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/market",
    validateSearch: (search: Record<string, unknown>) => pickMarketplaceSearch(search),
    component: function Market() {
      const search = useSearch({ strict: false }) as ReturnType<typeof pickMarketplaceSearch>;
      return (
        <MarketListDesk
          scope={scope}
          creditDepthSearch={search.creditDepth}
          outputVoucherSearch={search.out_voucher}
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
      stub("/vouchers/$voucherAddress"),
      stub("/catalogs/$catalogId"),
      stub("/posts/$reportId"),
      stub("/wants/$wantId"),
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

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  mocks.list.mockReset();
  mocks.offers.mockReset();
  mocks.voucher.mockReset();
  mocks.voucher.mockResolvedValue({ address: VOUCHER, symbol: "BAKE", name: "Bakery" });
  mocks.auth.state = "guest";
  mocks.auth.isAuthenticated = false;
  mocks.auth.address = undefined;
  mocks.distanceOrigin = null;
  mocks.verification.pools = [];
  mocks.verification.status = "ready";
  mocks.availability.pools = [{ chainId: 100, address: POOL_A }];
  mocks.availability.status = "ready";
  mocks.availability.hasVerificationGaps = false;
  mocks.availability.retry.mockReset();
});

function signIn() {
  mocks.auth.state = "authenticated";
  mocks.auth.isAuthenticated = true;
  mocks.auth.address = MEMBER;
}

describe("MarketListDesk loading and recovery", () => {
  it("draws a flat row skeleton, with no spinner, until the first page arrives", async () => {
    let finish: (value: ReturnType<typeof page>) => void = () => {};
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    renderList("/market?scope=pools&view=list");

    const loading = await screen.findByRole("status", { name: "" });
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toBe("Loading marketplace…");
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(4);

    finish(page([pool(POOL_A, "Mombasa Bakers")]));
    expect(await screen.findByText("Mombasa Bakers")).toBeTruthy();
    expect(screen.queryByText("Loading marketplace…")).toBeNull();
  });

  it("offers Retry when the first request fails, and shows the rows once it works", async () => {
    mocks.list
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList("/market?scope=pools&view=list");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load marketplace results.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Mombasa Bakers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("MarketListDesk pagination", () => {
  it("keeps the rows when the next page fails and says so, never reading as the end", async () => {
    mocks.list
      .mockResolvedValueOnce(page([pool(POOL_A, "Mombasa Bakers")], "cursor-2"))
      .mockRejectedValueOnce(new Error("page two down"))
      .mockResolvedValueOnce(page([pool(POOL_B, "Kilifi Weavers")]));
    renderList("/market?scope=pools&view=list");

    expect(await screen.findByText("Mombasa Bakers")).toBeTruthy();
    // More pages exist, so a visible fallback is there beside the scroll trigger.
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load more");
    expect(screen.getByText("Mombasa Bakers")).toBeTruthy();
    expect(screen.queryByText("No more results")).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Kilifi Weavers")).toBeTruthy();
    expect(screen.getByText("Mombasa Bakers")).toBeTruthy();
    expect(await screen.findByText("No more results")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says No more results only once every page has loaded", async () => {
    mocks.list.mockResolvedValueOnce(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList("/market?scope=pools&view=list");
    expect(await screen.findByText("Mombasa Bakers")).toBeTruthy();
    expect(await screen.findByText("No more results")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("MarketListDesk no matches and Clear filters", () => {
  it("clears the search, Credit and the requested output together", async () => {
    signIn();
    mocks.verification.pools = [{ chainId: 100, address: POOL_A }];
    mocks.list.mockResolvedValue(page([]));
    const router = renderList(
      `/market?scope=pools&view=list&q=zzz&creditDepth=1&out_voucher=${VOUCHER}`,
    );

    expect(
      await screen.findByText("No creditable pools with this voucher match these filters."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => {
      const search = router.state.location.search as Record<string, unknown>;
      expect(search.q).toBeUndefined();
      expect(search.creditable).toBeUndefined();
      expect(search.out_voucher).toBeUndefined();
    });
    // The scope and the view are not filters.
    expect(router.state.location.search).toMatchObject({ scope: "pools", view: "list" });
  });

  it("names a plain empty search as no matches and offers the same action", async () => {
    mocks.list.mockResolvedValue(page([]));
    renderList("/market?scope=pools&view=list&q=zzz");
    expect(await screen.findByText("No marketplace results found.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
    expect(screen.queryByText("No more results")).toBeNull();
  });
});

describe("MarketListDesk requested output (Get a voucher)", () => {
  it("shows a Get chip with the real symbol, narrows to the pools that can pay it, and removes only itself", async () => {
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    const router = renderList(`/market?scope=pools&view=list&q=bake&out_voucher=${VOUCHER}`);

    const chip = await screen.findByRole("button", { name: "Remove filter: Get BAKE" });
    expect(chip.textContent).toContain("Get BAKE");
    expect(await screen.findByText("Mombasa Bakers")).toBeTruthy();
    expect(mocks.list.mock.calls[0]?.[0]).toMatchObject({
      kinds: ["pool"],
      pools: [{ chainId: 100, address: POOL_A }],
    });

    fireEvent.click(chip);
    await waitFor(() => {
      expect((router.state.location.search as Record<string, unknown>).out_voucher).toBeUndefined();
    });
    // The search stays: only the output constraint was removed.
    expect(router.state.location.search).toMatchObject({ q: "bake", scope: "pools" });
  });

  it("opens the swap with the voucher chosen for a signed-in member, and the pool page for a guest", async () => {
    signIn();
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    const member = renderList(`/market?scope=pools&view=list&out_voucher=${VOUCHER}`);
    const row = await screen.findByRole("link", { name: /Mombasa Bakers/ });
    expect(row.getAttribute("href")).toBe(`/pools/${POOL_A}/swap?receive=${VOUCHER}`);
    fireEvent.click(row);
    await waitFor(() => expect(member.state.location.pathname).toBe(`/pools/${POOL_A}/swap`));
    expect(member.state.location.search).toMatchObject({ receive: VOUCHER });
  });

  it("links a guest's row to the pool page, as the phone list does", async () => {
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList(`/market?scope=pools&view=list&out_voucher=${VOUCHER}`);
    const row = await screen.findByRole("link", { name: /Mombasa Bakers/ });
    expect(row.getAttribute("href")).toBe(`/pools/${POOL_A}`);
  });

  it("intersects with Credit: only pools in both reach the request", async () => {
    signIn();
    mocks.availability.pools = [
      { chainId: 100, address: POOL_A },
      { chainId: 100, address: POOL_B },
    ];
    mocks.verification.pools = [{ chainId: 100, address: POOL_B }];
    mocks.list.mockResolvedValue(page([pool(POOL_B, "Kilifi Weavers")]));
    renderList(`/market?scope=pools&view=list&creditDepth=1&out_voucher=${VOUCHER}`);

    expect(await screen.findByText("Kilifi Weavers")).toBeTruthy();
    expect(mocks.list.mock.calls[0]?.[0]).toMatchObject({
      pools: [{ chainId: 100, address: POOL_B }],
    });
  });

  it("gives an invalid output link its own recovery and makes no request", async () => {
    const router = renderList("/market?scope=pools&view=list&out_voucher=not-an-address");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This link contains an invalid output voucher.");
    expect(mocks.list).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole("button", { name: "Clear filter" }));
    await waitFor(() => {
      expect((router.state.location.search as Record<string, unknown>).out_voucher).toBeUndefined();
    });
  });

  it("says when the availability check failed, with Retry, and requests nothing broader", async () => {
    mocks.availability.status = "error";
    mocks.availability.pools = [];
    renderList(`/market?scope=pools&view=list&out_voucher=${VOUCHER}`);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't check voucher availability.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(mocks.availability.retry).toHaveBeenCalledTimes(1);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("says no pool has the voucher when the check finds none, rather than listing every pool", async () => {
    mocks.availability.pools = [];
    renderList(`/market?scope=pools&view=list&out_voucher=${VOUCHER}`);

    expect(await screen.findByText("No pools have this voucher available.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

describe("MarketListDesk remembered filters", () => {
  const remember = (name: string, tags: string[]) =>
    window.localStorage.setItem(
      ownerScopedKey(GUEST_STORAGE_OWNER, name),
      JSON.stringify({ tags, tagMatch: "any", vouchers: [], voucherMatch: "any" }),
    );

  it("restores the Pools list's own remembered tags, as the phone's Pools page does", async () => {
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Tea Pool")]));
    remember(CATALOG_FILTER_PREFERENCE_NAMES.market, ["Market only"]);
    remember(CATALOG_FILTER_PREFERENCE_NAMES.pools, ["Food"]);
    const router = renderList("/market?scope=pools", "pools");

    await waitFor(() => expect(JSON.stringify(router.state.location.search)).toContain("Food"));
    expect(JSON.stringify(router.state.location.search)).not.toContain("Market only");
  });
});

describe("MarketListDesk guest entry", () => {
  // The way in is the top bar's Sign in; the toolbar holds filters only.
  it("keeps Credit from a guest without putting a way in among the chips", async () => {
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList("/market?scope=pools&view=list");
    expect(await screen.findByRole("button", { name: "Filters" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Credit: / })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("gives a member Credit in that place", async () => {
    signIn();
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList("/market?scope=pools&view=list");
    expect(await screen.findByRole("button", { name: /^Credit: / })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});

function hrefOf(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
  return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
}

describe("MarketListDesk navigation keeps the person's view", () => {
  it("removes the duplicate scope tabs while preserving list search and Credit", async () => {
    signIn();
    mocks.verification.pools = [{ chainId: 100, address: POOL_A }];
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList("/market?scope=pools&view=list&q=bake&creditDepth=1");
    await screen.findByText("Mombasa Bakers");

    expect(screen.queryByRole("navigation", { name: "Marketplace" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Search pools" }).getAttribute("value")).toBe(
      "bake",
    );
    expect(screen.getByRole("button", { name: /^Credit: / }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("opens the unified map without carrying a Pool-only output narrowing", async () => {
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList(`/market?scope=pools&view=list&out_voucher=${VOUCHER}`);
    await screen.findByText("Mombasa Bakers");

    const view = screen.getByRole("group", { name: "View" });
    const map = hrefOf(within(view).getByRole("link", { name: "Map" }));
    expect(map.path).toBe("/");
    expect(map.search).toMatchObject({ tab: "market", view: "map" });
    expect(map.search.out_voucher).toBeUndefined();
  });

  it("marks List as current and links Map to the unified destination", async () => {
    mocks.list.mockResolvedValue(page([pool(POOL_A, "Mombasa Bakers")]));
    renderList("/market?scope=vouchers&view=list", "vouchers");
    await screen.findByText("Mombasa Bakers");
    const view = screen.getByRole("group", { name: "View" });
    expect(within(view).getByRole("link", { name: "List" }).getAttribute("aria-current")).toBe(
      "page",
    );
    const map = hrefOf(within(view).getByRole("link", { name: "Map" }));
    expect(map.path).toBe("/");
    expect(map.search).toMatchObject({ tab: "market", view: "map" });
    expect(map.search.scope).toBeUndefined();
  });
});

describe("MarketListDesk resource cards", () => {
  it("renders every result kind with shared artwork, metadata, tags, distance, and destinations", async () => {
    mocks.distanceOrigin = { lat: -4.05, lng: 39.67 };
    const rows = [
      {
        kind: "voucher",
        id: "voucher-1",
        chainId: 100,
        address: VOUCHER,
        name: "Bakery voucher",
        symbol: "BAKE",
        voucherKind: "voucher",
        imageUrl: "https://example.com/broken.webp",
        locationName: "Kilifi",
        geoLat: -4.05,
        geoLng: 39.67,
        distanceMeters: 25,
        tags: ["Food", "Bread", "Local"],
      },
      {
        kind: "want",
        id: "12",
        chainId: null,
        address: null,
        name: "Need a bicycle",
        imageUrl: null,
        locationName: "Kilifi",
        geoLat: -4.06,
        geoLng: 39.68,
        tags: [],
      },
      pool(POOL_A, "Mombasa Bakers"),
      {
        kind: "catalog",
        id: "23",
        chainId: null,
        address: null,
        name: "Coastal directory",
        description: "Local makers",
        imageUrl: null,
        locationName: "Mombasa",
        geoLat: -4.04,
        geoLng: 39.66,
        tags: [],
      },
      {
        kind: "post",
        id: "34",
        chainId: null,
        address: null,
        name: "Market report",
        imageUrl: null,
        locationName: "Kilifi",
        geoLat: -4.03,
        geoLng: 39.65,
        tags: [],
      },
      {
        kind: "offering",
        id: "45",
        chainId: 100,
        address: VOUCHER,
        voucherAddress: VOUCHER,
        voucherName: "Bakery voucher",
        voucherSymbol: "BAKE",
        name: "Fresh bread",
        imageUrl: null,
        locationName: "Kilifi",
        geoLat: -4.05,
        geoLng: 39.67,
        tags: [],
      },
    ] as unknown as MarketplaceResult[];
    mocks.list.mockResolvedValue(page(rows));
    const router = renderList("/market?scope=all&view=list", "all");

    expect(await screen.findByText("Bakery voucher")).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes("BAKE") && content.includes("Kilifi")),
    ).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    const broken = document.querySelector('img[src="https://example.com/broken.webp"]');
    expect(broken).toBeTruthy();
    fireEvent.error(broken as HTMLImageElement);
    expect(document.querySelector('img[src="https://example.com/broken.webp"]')).toBeNull();

    expect(screen.getByRole("link", { name: /Mombasa Bakers/ }).getAttribute("href")).toBe(
      `/pools/${POOL_A}`,
    );
    expect(screen.getByRole("link", { name: /Coastal directory/ }).getAttribute("href")).toBe(
      "/catalogs/23",
    );
    expect(screen.getByRole("link", { name: /Market report/ }).getAttribute("href")).toBe(
      "/posts/34",
    );
    expect(screen.getByRole("link", { name: /Fresh bread/ }).getAttribute("href")).toBe(
      `/vouchers/${VOUCHER}?from=market`,
    );

    fireEvent.click(screen.getByRole("button", { name: /Need a bicycle/ }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ scope: "all", want: "12" }),
    );
  });
});

function offering(id: string, name: string) {
  return {
    id,
    sourceId: null,
    voucherId: id,
    voucherAddress: VOUCHER,
    voucherName: "Bakery voucher",
    voucherSymbol: "BAKE",
    voucherUoa: null,
    name,
    description: null,
    imageUrl: null,
    voucherImageUrl: null,
    pricePerUnit: null,
    unitLabel: null,
    quantity: null,
    frequency: null,
    tags: [],
    distanceMeters: null,
    effectiveGeoLat: null,
    effectiveGeoLng: null,
  };
}

describe("MarketListDesk Offers", () => {
  it("searches offers, draws image tiles in an intrinsic grid, and pages like the other lists", async () => {
    mocks.offers
      .mockResolvedValueOnce({
        offerings: [offering("1", "Fresh bread")],
        nextCursor: "next",
        tagFacets: [],
      })
      .mockRejectedValueOnce(new Error("page two down"))
      .mockResolvedValueOnce({
        offerings: [offering("2", "Honey")],
        nextCursor: null,
        tagFacets: [],
      });
    renderList("/market?scope=offers&view=list", "offers");

    expect(await screen.findByRole("combobox", { name: "Search offers" })).toBeTruthy();
    const tile = await screen.findByRole("link", { name: /Fresh bread/ });
    expect(tile.parentElement?.className).toContain(
      "grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]",
    );
    expect(mocks.list).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load more");
    expect(screen.getByRole("link", { name: /Fresh bread/ })).toBeTruthy();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /Honey/ })).toBeTruthy();
    expect(await screen.findByText("No more results")).toBeTruthy();
  });

  it("shows tile skeletons while the first page loads", async () => {
    mocks.offers.mockImplementation(() => new Promise(() => {}));
    renderList("/market?scope=offers&view=list", "offers");
    const loading = await screen.findByRole("status");
    expect(loading.textContent).toBe("Loading marketplace…");
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
