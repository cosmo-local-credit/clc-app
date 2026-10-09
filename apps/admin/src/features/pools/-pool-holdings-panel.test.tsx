import { normalizeUserPool, type PoolVoucher, type UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PoolHoldingsPanel } from "./ui/pool-holdings-panel";

const token = "0x2222222222222222222222222222222222222222";
const seeded = "0x3333333333333333333333333333333333333333";
const mocks = vi.hoisted(() => ({ tokens: vi.fn(), treasury: vi.fn(), rates: vi.fn() }));
vi.mock("#/lib/api", () => ({
  clcApi: { accounts: { getAccountTokens: (...args: unknown[]) => mocks.tokens(...args) } },
}));
vi.mock("./use-pool-treasury", () => ({
  usePoolTreasury: (...args: unknown[]) => mocks.treasury(...args),
}));
vi.mock("./use-pool-pricing", () => ({
  usePoolRates: (...args: unknown[]) => mocks.rates(...args),
}));

const pool = normalizeUserPool({
  address: "0x1111111111111111111111111111111111111111",
  chainId: 100,
  symbol: "POOL",
  unitOfAccount: "KES",
  limiterAddress: seeded,
  voucherCount: 1,
})!;
const voucher: PoolVoucher = {
  id: "1",
  tokenAddress: token,
  name: "Kiriba",
  symbol: "RIBA",
  decimals: 6,
  iconUrl: null,
  tokenLimit: "100000000",
  chainId: 100,
  description: "",
  ownerAddress: null,
  voucherType: null,
  voucherUoa: null,
  voucherValue: null,
  locationName: null,
  bannerUrl: null,
  active: true,
  internal: false,
  isAllowed: true,
  oracleFeedId: null,
  oracleName: null,
  oracleAddress: null,
  offerCount: 0,
  availableOfferCount: 0,
  tags: [],
};
const snapshot = new Map([
  [
    token,
    {
      balanceRaw: "50000000",
      feesRaw: "10000000",
      withdrawableRaw: "40000000",
      limitRaw: "100000000",
    },
  ],
]);

function renderPanel(quoterType: UserPool["quoterType"] = "relative", credit = false) {
  const root = createRootRoute({
    component: () => (
      <PoolHoldingsPanel
        pool={{ ...pool, quoterType }}
        vouchers={[voucher]}
        vouchersState={{ kind: "ready" }}
        credit={credit}
        onConfigure={() => {}}
      />
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.tokens.mockReset().mockResolvedValue({ tokens: [] });
  mocks.treasury
    .mockReset()
    .mockReturnValue({ data: snapshot, isPending: false, isError: false, error: null });
  mocks.rates.mockReset().mockReturnValue({ data: { [token]: "2000000" }, isError: false });
});

describe("PoolHoldingsPanel", () => {
  it("shows reserved fees separately from available liquidity", async () => {
    renderPanel();
    const table = within(await screen.findByRole("table"));
    expect(table.getByText("50")).toBeTruthy();
    expect(table.getByText("40")).toBeTruthy();
    expect(table.getByText("10")).toBeTruthy();
    expect(table.getByText("80")).toBeTruthy();
  });

  it.each(["relative", "oracle", "decimal"] as const)(
    "uses gross balances for credit with %s pricing",
    async (quoterType) => {
      renderPanel(quoterType, true);
      const table = within(await screen.findByRole("table"));
      expect(table.getByRole("columnheader", { name: /^Available credit$/ })).toBeTruthy();
      expect(table.getAllByText("50")).toHaveLength(2);
      expect(table.queryByText("60")).toBeNull();
      if (quoterType !== "relative")
        expect(table.queryByRole("columnheader", { name: /KES/ })).toBeNull();
    },
  );

  it("includes indexed tokens absent from the voucher catalog", async () => {
    mocks.tokens.mockResolvedValue({
      tokens: [
        {
          id: 2,
          tokenAddress: seeded,
          tokenName: "Seeded voucher",
          tokenSymbol: "SEED",
          tokenDecimals: 6,
          balance: "7000000",
          iconUrl: null,
        },
      ],
    });
    renderPanel("decimal");
    expect(await screen.findByText("Seeded voucher")).toBeTruthy();
    expect(screen.getByText("Not catalogued")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("does not report an unread balance or headroom as zero", async () => {
    mocks.treasury.mockReturnValue({
      data: new Map(),
      isPending: false,
      isError: false,
      error: null,
    });
    renderPanel("oracle", true);
    const table = within(await screen.findByRole("table"));
    expect(table.getAllByText("—")).toHaveLength(2);
    expect(table.queryByText("0")).toBeNull();
  });

  it("keeps known chain holdings visible when discovery fails", async () => {
    mocks.tokens.mockRejectedValue(new Error("Indexer unavailable"));
    renderPanel();
    expect(
      await screen.findByText("Additional indexed holdings could not be loaded."),
    ).toBeTruthy();
    expect(screen.getByText("Kiriba")).toBeTruthy();
  });
});
