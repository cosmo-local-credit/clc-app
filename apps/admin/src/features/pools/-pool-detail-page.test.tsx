import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PoolDetailPage } from "./pool-detail-page";
import { parsePoolDetailSearch } from "./pool-detail-search";

const ADDRESS = "0xdD97a5282D11e55d7271d466C80963d6793B276f";
const OWNER = "0x33a573149db22e759fB9A38Bcc461C12855c2645";
const LIMITER = "0x4d9000000000000000000000000000000000a1c7";
const AGGREGATOR = "0x0826000000000000000000000000000000005e9D";
const RIBA = "0x3aa7000000000000000000000000000000000102";

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: () => <div>Map</div>,
}));

const getPoolByAddress = vi.hoisted(() => vi.fn());
const getPoolVouchers = vi.hoisted(() => vi.fn());
const getPoolOfferings = vi.hoisted(() => vi.fn());
const listPoolTransactions = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: {
    pools: {
      getPoolByAddress: (...args: unknown[]) => getPoolByAddress(...args),
      getPoolVouchers: (...args: unknown[]) => getPoolVouchers(...args),
    },
    offerings: {
      getPoolOfferings: (...args: unknown[]) => getPoolOfferings(...args),
    },
    admin: {
      listPoolTransactions: (...args: unknown[]) => listPoolTransactions(...args),
    },
  },
}));

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "12",
    chainId: 42220,
    address: ADDRESS,
    name: "Kawangware",
    symbol: "KAW",
    ownerAddress: OWNER,
    feePpm: 5_000,
    feeAddress: OWNER,
    tokenRegistryAddress: null,
    limiterAddress: null,
    quoterAddress: null,
    quoterType: null,
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "A neighbourhood liquidity pool.",
    unitOfAccount: "KES",
    locationName: "Kawangware, Nairobi",
    geoLat: -1.2833,
    geoLng: 36.75,
    email: "steward@example.test",
    website: "https://kawangware.example",
    phone: "+254700000000",
    imageUrl: null,
    bannerUrl: null,
    terms: "https://kawangware.example/terms",
    defaultVoucherId: null,
    voucherCount: 4,
    tags: ["food", "care"],
    createdAt: "2026-08-13T11:00:00Z",
    updatedAt: "2026-08-13T11:00:00Z",
    ...overrides,
  };
}

function poolVoucher(overrides: Partial<PoolVoucher> = {}): PoolVoucher {
  return {
    id: "1",
    chainId: 42220,
    name: "Kiriba",
    description: "Kiriba",
    symbol: "RIBA",
    tokenAddress: RIBA as PoolVoucher["tokenAddress"],
    decimals: 6,
    ownerAddress: null,
    voucherType: null,
    voucherUoa: null,
    voucherValue: null,
    locationName: null,
    iconUrl: null,
    bannerUrl: null,
    active: true,
    internal: false,
    isAllowed: true,
    tokenLimit: "300000000",
    oracleFeedId: "7",
    oracleName: "KES / USD",
    oracleAddress: AGGREGATOR as PoolVoucher["oracleAddress"],
    offerCount: 12,
    availableOfferCount: 3,
    tags: [],
    syncedAt: "2026-08-18T11:38:00Z",
    ...overrides,
  };
}

function renderDetailRoute(entries = ["/pools", `/pools/${ADDRESS}`]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const detailRoute = createRoute({
    getParentRoute: () => root,
    path: "/pools/$address",
    validateSearch: parsePoolDetailSearch,
    component: function DetailRoute() {
      return <PoolDetailPage address={ADDRESS} search={detailRoute.useSearch()} />;
    },
  });
  const listRoute = createRoute({
    getParentRoute: () => root,
    path: "/pools",
    component: () => <p>pools</p>,
  });

  const router = createRouter({
    routeTree: root.addChildren([detailRoute, listRoute]),
    history: createMemoryHistory({ initialEntries: entries }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  getPoolByAddress.mockReset();
  getPoolVouchers.mockReset();
  getPoolOfferings.mockReset();
  listPoolTransactions.mockReset();
  getPoolVouchers.mockResolvedValue({ vouchers: [] });
  getPoolOfferings.mockResolvedValue({ offerings: [], first: 0, last: 0, receivedCount: 0 });
  listPoolTransactions.mockResolvedValue({
    transactions: [],
    first: 0,
    last: 0,
    receivedCount: 0,
  });
});

describe("PoolDetailPage", () => {
  it("leads with identity and keeps the address in the header only", async () => {
    getPoolByAddress.mockResolvedValue(pool());

    renderDetailRoute();

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Kawangware");
    expect(screen.getByText(ADDRESS)).toBeTruthy();
    expect(screen.getAllByText(ADDRESS)).toHaveLength(1);
    expect(screen.getByText("KAW")).toBeTruthy();
    expect(screen.getByText("ID 12")).toBeTruthy();
    expect(screen.getByText("4 vouchers")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Transactions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy pool address" })).toBeTruthy();
  });

  it("splits the record into catalog metadata and chain state, unlabelled", async () => {
    getPoolByAddress.mockResolvedValue(pool());

    renderDetailRoute();

    // No group headings: which column a row sits in is what says whether the
    // fact is a steward's to change or the chain's.
    await waitFor(() => expect(screen.getByText("steward@example.test")).toBeTruthy());
    expect(screen.queryByText("Pool profile")).toBeNull();
    expect(screen.queryByText("Directory")).toBeNull();
    expect(screen.queryByText("Contracts")).toBeNull();
    expect(screen.getByText("+254700000000")).toBeTruthy();
    expect(screen.getByText("kawangware.example")).toBeTruthy();
    expect(screen.getByText("food")).toBeTruthy();
    expect(screen.getByText("Kawangware, Nairobi")).toBeTruthy();
    expect(screen.getByText("Map")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Overview" })).toBeNull();
  });

  it("defaults the records tab to vouchers and remaps a stale overview URL", async () => {
    getPoolByAddress.mockResolvedValue(pool());

    const router = renderDetailRoute(["/pools", `/pools/${ADDRESS}?tab=overview`]);

    await waitFor(() => expect(screen.getByRole("tab", { selected: true })).toBeTruthy());
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Vouchers");
    expect(router.state.location.search).toMatchObject({ tab: "vouchers" });
  });

  it("keeps the open tab in the URL and restores it on Back", async () => {
    getPoolByAddress.mockResolvedValue(pool());

    const router = renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(router.state.location.search).toMatchObject({ tab: "vouchers" });

    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "activity" }));

    act(() => {
      router.history.back();
    });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "vouchers" }));
  });

  it("does not push history when the open tab is selected again", async () => {
    getPoolByAddress.mockResolvedValue(pool());

    const router = renderDetailRoute();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());

    fireEvent.click(screen.getByRole("tab", { name: "Vouchers" }));
    act(() => {
      router.history.back();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/pools"));
  });

  it("counts the fetched voucher page into the summary tiles", async () => {
    getPoolByAddress.mockResolvedValue(pool({ voucherCount: 2 }));
    getPoolVouchers.mockResolvedValue({
      vouchers: [poolVoucher(), poolVoucher({ id: "2", symbol: "MUMO", oracleFeedId: null })],
    });

    renderDetailRoute();

    const summary = await waitFor(() => screen.getByRole("region", { name: "Pool summary" }));
    expect(summary.textContent).toContain("Priced");
    expect(summary.textContent).toContain("1 unpriced");
    // 12 + 12 offers, 3 + 3 of them live.
    expect(summary.textContent).toContain("6 live");
  });

  it("says how much of the pool a partial voucher page covered", async () => {
    getPoolByAddress.mockResolvedValue(pool({ voucherCount: 9 }));
    getPoolVouchers.mockResolvedValue({ vouchers: [poolVoucher()] });

    renderDetailRoute();

    const summary = await waitFor(() => screen.getByRole("region", { name: "Pool summary" }));
    expect(summary.textContent).toContain("of 1 loaded");
  });

  it("names the dependency pointers the catalog has no address for", async () => {
    getPoolByAddress.mockResolvedValue(pool());

    renderDetailRoute();

    const attention = await waitFor(() => screen.getByRole("region", { name: "Pool attention" }));
    expect(attention.textContent).toContain("5 of 5 contract pointers unrecorded");
    expect(attention.textContent).toContain("quoter");
  });

  it("draws no attention to a pool whose record and vouchers are complete", async () => {
    getPoolByAddress.mockResolvedValue(
      pool({
        voucherCount: 1,
        // Null on every pool this console publishes, and never flagged for it.
        feeAddress: null,
        tokenRegistryAddress: LIMITER as UserPool["tokenRegistryAddress"],
        limiterAddress: LIMITER as UserPool["limiterAddress"],
        quoterAddress: LIMITER as UserPool["quoterAddress"],
        feePolicyAddress: LIMITER as UserPool["feePolicyAddress"],
        protocolFeeControllerAddress: LIMITER as UserPool["protocolFeeControllerAddress"],
      }),
    );
    getPoolVouchers.mockResolvedValue({ vouchers: [poolVoucher()] });

    renderDetailRoute();

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeTruthy());
    expect(screen.queryByRole("region", { name: "Pool attention" })).toBeNull();
  });

  it("scales the limiter cap by the voucher's decimals", async () => {
    getPoolByAddress.mockResolvedValue(
      pool({ limiterAddress: LIMITER as UserPool["limiterAddress"] }),
    );
    getPoolVouchers.mockResolvedValue({ vouchers: [poolVoucher()] });

    renderDetailRoute();

    // 300000000 raw at six decimals, not the integer the catalog stores.
    await waitFor(() => expect(screen.getByText("300")).toBeTruthy());
    expect(screen.queryByText("300000000")).toBeNull();
    // Every row the endpoint returns is allowed, so the column is gone.
    expect(screen.queryByRole("columnheader", { name: "Status" })).toBeNull();
  });

  it("marks a zero cap as blocked rather than as no cap", async () => {
    getPoolByAddress.mockResolvedValue(
      pool({ limiterAddress: LIMITER as UserPool["limiterAddress"] }),
    );
    getPoolVouchers.mockResolvedValue({ vouchers: [poolVoucher({ tokenLimit: "0" })] });

    renderDetailRoute();

    await waitFor(() => expect(screen.getByLabelText("deposit state blocked")).toBeTruthy());
  });

  it("groups vouchers by the aggregator that prices them", async () => {
    getPoolByAddress.mockResolvedValue(pool({ voucherCount: 2 }));
    getPoolVouchers.mockResolvedValue({
      vouchers: [poolVoucher(), poolVoucher({ id: "2", symbol: "MUMO" })],
    });

    renderDetailRoute();

    fireEvent.click(await waitFor(() => screen.getByRole("tab", { name: "Price feeds" })));

    // Scoped to the panel: the offers chart beside it also names the symbols.
    const panel = await waitFor(() => screen.getByRole("tabpanel"));
    await waitFor(() => expect(within(panel).getByText("KES / USD")).toBeTruthy());
    expect(within(panel).getByText("RIBA")).toBeTruthy();
    expect(within(panel).getByText("MUMO")).toBeTruthy();
    // One row for one shared feed, not one row per voucher.
    expect(within(panel).getAllByText("KES / USD")).toHaveLength(1);
  });

  it("lists what the pool's vouchers are offered for", async () => {
    getPoolByAddress.mockResolvedValue(pool());
    getPoolOfferings.mockResolvedValue({
      offerings: [
        {
          id: "3",
          sourceId: null,
          voucherId: "1",
          voucherAddress: RIBA,
          voucherName: "Kiriba",
          voucherSymbol: "RIBA",
          voucherDecimals: 6,
          sellerAddress: OWNER,
          commodityName: "Maize flour",
          commodityType: "GOOD",
          description: "",
          quantity: "20",
          unit: "kg",
          frequency: "week",
          price: "150",
          available: true,
          locationName: null,
          geoLat: null,
          geoLng: null,
          imageUrl: null,
          tags: [],
        },
      ],
      first: 3,
      last: 3,
      receivedCount: 1,
    });

    renderDetailRoute();

    fireEvent.click(await waitFor(() => screen.getByRole("tab", { name: "Offerings" })));

    await waitFor(() => expect(screen.getByText("Maize flour")).toBeTruthy());
    expect(screen.getByText("20 kg")).toBeTruthy();
    expect(screen.getByText("150 RIBA")).toBeTruthy();
  });

  it("uses the compact remix copy icon", async () => {
    getPoolByAddress.mockResolvedValue(pool());

    renderDetailRoute();

    const copy = await waitFor(() => screen.getByRole("button", { name: "Copy pool address" }));
    expect(copy.className).toContain("size-6");
    expect(copy.querySelector("svg")?.classList.contains("size-3")).toBe(true);
  });
});
