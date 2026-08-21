import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseVoucherDetailSearch } from "./voucher-detail-search";

const ADDRESS = "0xE74B7fDeda8f66A01dC438A012b1eE5cc377298D";

vi.mock("@clc/api/features/market/queries", () => ({
  voucherQueryOptions: () => ({
    queryKey: ["voucher", ADDRESS],
    queryFn: () => ({
      id: "1",
      chainId: 42220,
      address: ADDRESS,
      name: "Sarafu",
      symbol: "SRF",
      decimals: 6,
      ownerAddress: "0x33a573149db22e759fB9A38Bcc461C12855c2645",
      description: "Community voucher",
      voucherUoa: "KES",
      voucherValue: "1",
      locationName: "Nairobi",
      lat: -1.29,
      lng: 36.82,
      email: null,
      website: null,
      phone: null,
      terms: null,
      iconUrl: null,
      bannerUrl: null,
      tags: ["Agriculture"],
      kind: "voucher",
    }),
  }),
}));

vi.mock("@clc/api/features/offerings/queries", () => ({
  voucherOfferingsQueryOptions: () => ({
    queryKey: ["offerings", ADDRESS],
    queryFn: () => ({
      offerings: [
        {
          id: "off-1",
          sourceId: null,
          voucherId: "1",
          voucherAddress: ADDRESS,
          voucherName: "Sarafu",
          voucherSymbol: "SRF",
          voucherDecimals: 6,
          sellerAddress: "0x33a573149db22e759fB9A38Bcc461C12855c2645",
          name: "Maize flour",
          commodityType: "GOOD",
          description: "2kg bag",
          quantity: "10",
          unit: "bag",
          unitLabel: "bag",
          frequency: null,
          pricePerUnit: "120",
          available: true,
          locationName: "Nairobi",
          geoLat: null,
          geoLng: null,
          imageUrl: "https://example.test/maize.jpg",
          tags: [],
        },
      ],
      first: 1,
      last: 1,
      receivedCount: 1,
    }),
  }),
}));

vi.mock("@clc/api/features/admin/queries", () => ({
  adminVoucherTransactionsQueryOptions: () => ({
    queryKey: ["tx", ADDRESS],
    queryFn: () => ({
      transactions: [
        {
          id: 10_000_000,
          txId: 10,
          logIndex: 0,
          txHash: "0xabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabca",
          t: "2026-08-13T11:00:00Z",
          success: true,
          type: "transfer",
          voucher: ADDRESS,
          voucherName: "Sarafu",
          voucherSymbol: "SRF",
          voucherDecimals: 6,
          from: ADDRESS,
          to: ADDRESS,
          amount: "1000000",
        },
      ],
      first: 10_000_000,
      last: 10_000_000,
      receivedCount: 1,
    }),
  }),
}));

vi.mock("@clc/api/features/reports/queries", () => ({
  reportFilteredQueryOptions: () => ({
    queryKey: ["reports", ADDRESS],
    queryFn: () => ({
      reports: [
        {
          id: "rep-1",
          title: "Market day",
          description: "Weekly sale",
          imageUrl: null,
          locationName: "Nairobi",
          lat: null,
          lng: null,
          periodFrom: null,
          periodTo: null,
          authorAddress: null,
          createdAt: null,
          updatedAt: "2026-08-13T10:00:00Z",
          tags: ["market"],
          vouchers: [],
        },
      ],
      next: null,
    }),
  }),
}));

vi.mock("@clc/api/features/pools/queries", () => ({
  poolFilteredQueryOptions: () => ({
    queryKey: ["pools", ADDRESS],
    queryFn: () => ({
      pools: [
        {
          id: "pool-1",
          chainId: 42220,
          address: "0x1111111111111111111111111111111111111111",
          name: "Kawangware Pool",
          symbol: "KWP",
          ownerAddress: null,
          feePpm: 3000,
          feeAddress: null,
          tokenRegistryAddress: null,
          limiterAddress: null,
          quoterAddress: null,
          feePolicyAddress: null,
          protocolFeeControllerAddress: null,
          feesDecoupled: false,
          decimals: 6,
          description: "",
          unitOfAccount: null,
          locationName: null,
          geoLat: null,
          geoLng: null,
          email: null,
          website: null,
          phone: null,
          imageUrl: null,
          bannerUrl: null,
          terms: null,
          defaultVoucherId: null,
          voucherCount: 4,
          tags: [],
        },
      ],
      receivedCount: 1,
    }),
  }),
}));

const { VoucherDetailPage } = await import("./voucher-detail-page");

function renderPage(tab?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/vouchers/$address",
    validateSearch: parseVoucherDetailSearch,
    component: () => {
      const { address } = detail.useParams();
      return <VoucherDetailPage address={address} search={detail.useSearch()} />;
    },
  });
  const transactions = createRoute({
    getParentRoute: () => root,
    path: "/transactions",
    component: () => <div>Transactions list</div>,
  });
  const pool = createRoute({
    getParentRoute: () => root,
    path: "/pools/$address",
    component: () => <div>Pool detail</div>,
  });
  const search = tab ? `?tab=${tab}` : "";
  const router = createRouter({
    routeTree: root.addChildren([detail, transactions, pool]),
    history: createMemoryHistory({ initialEntries: [`/vouchers/${ADDRESS}${search}`] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("VoucherDetailPage tabs", () => {
  it("shows offerings for this voucher and links the other records", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Sarafu" })).toBeTruthy();
    expect(await screen.findByText("Maize flour")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Maize flour" })).toBeTruthy();

    // Thumbnails, eight across from xl. Pinned because the density is the whole
    // reason this panel is a grid of images rather than the table the pool screen
    // uses for the same resource.
    const grid = screen.getByRole("img", { name: "Maize flour" }).closest(".grid");
    expect(grid?.className).toContain("xl:grid-cols-8");

    // The tile is the edit control: a footer button would cost a row of height on
    // every tile to duplicate what clicking the thing already means.
    const tile = screen.getByRole("button", { name: /Maize flour/ });
    expect(tile.querySelector("img")).toBeTruthy();
    // Availability is not shown, because this tab reads the public list where
    // every row is available by definition.
    expect(screen.queryByText("available")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    expect(await screen.findByText("transfer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open transactions" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Reports" }));
    expect(await screen.findByText("Market day")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Pools" }));
    expect(await screen.findByRole("link", { name: "Kawangware Pool" })).toBeTruthy();
  });
});
