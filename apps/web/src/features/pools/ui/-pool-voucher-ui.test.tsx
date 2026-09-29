import {
  poolQuoterReverseValueForAbi,
  swapPoolGetQuoteAbi,
  swapRouterQuoteExactInputAbi,
  swapRouterQuoteExactOutputAbi,
} from "@clc/core/features/pool-swaps/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  holderBalances,
  navigate,
  poolLiquidityBalance,
  poolNetFee,
  poolQuoteRate,
  poolRegistry,
  poolTreasuryState,
  poolTokenLimit,
  poolTransfers,
  publicClientCall,
  publicClientMulticall,
  publicClientRead,
  swapMutateAsync,
  swapTransferState,
} = vi.hoisted(() => ({
  // What the wallet holds of each voucher, on chain. The swap screen reads this
  // per voucher rather than from the indexer's holdings page, so a voucher the
  // holder has not moved lately cannot fall off a page and read as a zero.
  holderBalances: { value: {} as Record<string, bigint> },
  navigate: vi.fn(),
  poolLiquidityBalance: { value: 1_000_000_000n },
  poolQuoteRate: { numerator: 2n, denominator: 1n },
  /** Pool fee plus protocol fee, in ppm, taken out of an exact-input quote's output. */
  poolNetFee: { ppm: 0n },
  /**
   * The pool's `TokenUniqueSymbolIndex`. Unset, the pool has no registry and the
   * catalog is the whole menu; set, `entries` is what the chain admits and
   * `metadata` what those tokens report about themselves.
   */
  poolRegistry: {
    address: null as string | null,
    entries: [] as string[],
    metadata: {} as Record<string, { symbol: string; name: string; decimals: number }>,
  },
  poolTreasuryState: {
    balances: {} as Record<string, bigint>,
    fees: {} as Record<string, bigint>,
    feesDecoupled: false,
  },
  /**
   * `limitOf(token, pool)` per token, over a default high enough to leave every
   * swap room. The pool holds 30 of each voucher, so a cap of 30_000_000n is a
   * pool that is full of it.
   */
  poolTokenLimit: { overrides: {} as Record<string, bigint>, fallback: 1_000_000_000n },
  publicClientCall: vi.fn(),
  publicClientMulticall: vi.fn(),
  publicClientRead: vi.fn(),
  poolTransfers: { value: [] as Array<Record<string, unknown>> },
  swapMutateAsync: vi.fn(),
  swapTransferState: { error: null as Error | null, isPending: false },
}));

vi.mock("@tanstack/react-router", () => ({
  // Router props are dropped, but ARIA and identity props are forwarded: the
  // pool tab strip is built from Links and its roles are part of the contract.
  Link: ({
    children,
    to: _to,
    params: _params,
    search: _search,
    replace: _replace,
    resetScroll: _resetScroll,
    preload: _preload,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) => (
    <a {...(props as React.ComponentProps<"a">)}>{children}</a>
  ),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  useNavigate: () => navigate,
}));

vi.mock("viem/actions", () => ({
  call: (_client: unknown, args: unknown) => publicClientCall(args),
  getBlockNumber: () => Promise.resolve(100n),
  multicall: (_client: unknown, args: unknown) => publicClientMulticall(args),
  readContract: (_client: unknown, args: unknown) => publicClientRead(args),
}));

vi.mock("wagmi", () => ({
  useClient: () => ({ uid: "test-client" }),
  useConnection: () => ({ address: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => "delegated",
}));

vi.mock("#/features/pools/hooks/use-pool-swap-transfer", () => ({
  usePoolSwapTransfer: () => ({
    mutateAsync: swapMutateAsync,
    isPending: swapTransferState.isPending,
    error: swapTransferState.error,
  }),
}));

import { PoolDetailPage } from "./pool-detail-page";
import { PoolSwapPage } from "./pool-swap-page";

const POOL_ADDRESS = "0x1111111111111111111111111111111111111111";
const USDC_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const TTX_ADDRESS = "0x2222222222222222222222222222222222222222";
const RAMBO_ADDRESS = "0x5555555555555555555555555555555555555555";
const PLANK_ADDRESS = "0x6666666666666666666666666666666666666666";
const REGISTRY_ADDRESS = "0x7777777777777777777777777777777777777777";
const LIMITER_ADDRESS = "0x3333333333333333333333333333333333333333";
const QUOTER_ADDRESS = "0x4444444444444444444444444444444444444444";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockPoolRequests({
  usdcBalance = "12340000",
  usdcSymbol = "USDC",
  ttxSymbol = "TTX",
  // A voucher the pool takes and the holder has none of — off by default so the
  // holdings and offerings assertions keep their two-voucher arithmetic.
  withUnheldVoucher = false,
}: {
  usdcBalance?: string;
  usdcSymbol?: string;
  ttxSymbol?: string;
  withUnheldVoucher?: boolean;
} = {}) {
  holderBalances.value = {
    [USDC_ADDRESS.toLowerCase()]: BigInt(usdcBalance),
    [TTX_ADDRESS.toLowerCase()]: 9_000_000n,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}/vouchers`)) {
        return Promise.resolve(
          response({
            vouchers: [
              // `list-pool-vouchers` orders by `v.id DESC`, so the newest voucher
              // leads the page — which under the old screen was whatever got
              // preselected, held or not.
              ...(withUnheldVoucher
                ? [
                    {
                      id: 3,
                      address: RAMBO_ADDRESS,
                      name: "Rambo Token",
                      symbol: "RAMBO",
                      decimals: 6,
                      voucherUoa: "KES",
                      voucherValue: "1",
                      iconUrl: null,
                    },
                  ]
                : []),
              {
                id: 1,
                address: USDC_ADDRESS,
                name: "USD Coin",
                symbol: usdcSymbol,
                decimals: 6,
                voucherUoa: "USD",
                voucherValue: "1",
                tokenLimit: "40000000",
                iconUrl: "https://pool.example/usdc.png",
              },
              {
                id: 2,
                address: TTX_ADDRESS,
                name: "Trade Token",
                symbol: ttxSymbol,
                decimals: 6,
                voucherUoa: "KES",
                voucherValue: "2",
                iconUrl: "https://pool.example/ttx.png",
              },
            ],
          }),
        );
      }
      if (url.includes(`/api/v2/accounts/`) && url.includes("/transfers")) {
        return Promise.resolve(response({ transfers: poolTransfers.value }));
      }
      if (url.includes(`/api/v2/accounts/`) && url.includes("/tokens?")) {
        return Promise.resolve(
          response({
            tokens: [
              {
                id: 11,
                tokenAddress: USDC_ADDRESS,
                tokenSymbol: usdcSymbol,
                tokenName: "USD Coin",
                tokenDecimals: 6,
                balance: usdcBalance,
                iconUrl: "https://wallet.example/usdc.png",
                lastDateBlock: "2026-07-24T00:00:00Z",
              },
              {
                id: 12,
                tokenAddress: TTX_ADDRESS,
                tokenSymbol: ttxSymbol,
                tokenName: "Trade Token",
                tokenDecimals: 6,
                balance: "9000000",
                iconUrl: "https://wallet.example/ttx.png",
                lastDateBlock: "2026-07-24T00:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}/offerings`)) {
        return Promise.resolve(
          response({
            offerings: [
              {
                id: 91,
                voucherId: 1,
                voucherAddress: USDC_ADDRESS,
                voucherName: "USD Coin",
                voucherSymbol: "USDC",
                sellerAddress: "0x1111111111111111111111111111111111111111",
                commodityName: "Maize",
                commodityType: "GOOD",
                description: "A sack of maize",
                quantity: "4",
                unit: "bag",
                frequency: "week",
                price: "25",
                available: true,
                tags: [],
              },
              {
                id: 90,
                voucherId: 2,
                voucherAddress: TTX_ADDRESS,
                voucherName: "Trade Token",
                voucherSymbol: "TTX",
                sellerAddress: "0x2222222222222222222222222222222222222222",
                commodityName: "Tailoring",
                commodityType: "SERVICE",
                description: "",
                quantity: "1",
                unit: null,
                frequency: null,
                price: "8",
                available: true,
                tags: [],
              },
            ],
            first: 91,
            last: 90,
          }),
        );
      }
      if (url.includes(`/api/v2/pools/${POOL_ADDRESS}`)) {
        return Promise.resolve(
          response({
            address: POOL_ADDRESS,
            name: "Trade Pool",
            symbol: "TRD",
            unitOfAccount: "USD",
            limiterAddress: LIMITER_ADDRESS,
            quoterAddress: QUOTER_ADDRESS,
            feesDecoupled: poolTreasuryState.feesDecoupled,
            ...(poolRegistry.address ? { tokenRegistryAddress: poolRegistry.address } : {}),
            // Recorded, so the holdings panel does not have to probe for it.
            // Only a RelativeQuoter exposes a readable rate, and without one
            // the panel declines to value the pool rather than assume parity.
            quoterType: "relative",
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }),
  );
}

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function tokenLimitOf(token: unknown): bigint {
  return poolTokenLimit.overrides[String(token).toLowerCase()] ?? poolTokenLimit.fallback;
}

beforeEach(() => {
  poolLiquidityBalance.value = 1_000_000_000n;
  poolQuoteRate.numerator = 2n;
  poolQuoteRate.denominator = 1n;
  poolNetFee.ppm = 0n;
  poolRegistry.address = null;
  poolRegistry.entries = [];
  poolRegistry.metadata = {};
  publicClientRead.mockImplementation(({ functionName }: { functionName: string }) => {
    if (functionName === "entryCount") return Promise.resolve(BigInt(poolRegistry.entries.length));
    return Promise.reject(new Error(`Unexpected read: ${functionName}`));
  });
  poolTreasuryState.balances = {
    [USDC_ADDRESS.toLowerCase()]: 30_000_000n,
    [TTX_ADDRESS.toLowerCase()]: 30_000_000n,
  };
  poolTreasuryState.fees = {};
  poolTreasuryState.feesDecoupled = false;
  poolTokenLimit.overrides = {};
  swapTransferState.error = null;
  swapTransferState.isPending = false;
  swapMutateAsync.mockResolvedValue({ trackingId: "swap-tracking-1", signatureType: "secp256k1" });
  poolTransfers.value = [];
  publicClientMulticall.mockImplementation(
    ({
      allowFailure,
      contracts,
    }: {
      allowFailure: boolean;
      contracts: Array<{ address: string; functionName: string; args?: readonly unknown[] }>;
    }) => {
      // The registry's members, by index, at one block.
      if (!allowFailure && contracts[0]?.functionName === "entry") {
        return Promise.resolve(poolRegistry.entries);
      }
      // What a token the catalog does not know says about itself: symbol, name,
      // decimals — three to a token.
      if (allowFailure && contracts[0]?.functionName === "symbol") {
        return Promise.resolve(
          contracts.map((contract) => {
            const meta = poolRegistry.metadata[contract.address.toLowerCase()];
            const field = { symbol: meta?.symbol, name: meta?.name, decimals: meta?.decimals }[
              contract.functionName as "symbol" | "name" | "decimals"
            ];
            return field === undefined
              ? { status: "failure" }
              : { status: "success", result: field };
          }),
        );
      }
      // The swap screen's per-voucher reads: holder balance, pool balance, fees,
      // limiter cap — four to a voucher, in that order.
      if (allowFailure && contracts[3]?.functionName === "limitOf") {
        return Promise.resolve(
          contracts.map((contract, index) => ({
            status: "success",
            result:
              index % 4 === 0
                ? (holderBalances.value[contract.address.toLowerCase()] ?? 0n)
                : index % 4 === 1
                  ? (poolTreasuryState.balances[contract.address.toLowerCase()] ?? 30_000_000n)
                  : index % 4 === 2
                    ? (poolTreasuryState.fees[String(contract.args?.[0]).toLowerCase()] ?? 0n)
                    : tokenLimitOf(contract.args?.[0]),
          })),
        );
      }
      // The quote's deposit-side pair: what the pool holds of the input token,
      // and the cap it is measured against.
      if (allowFailure && contracts[1]?.functionName === "limitOf") {
        return Promise.resolve([
          { status: "success", result: 30_000_000n },
          { status: "success", result: tokenLimitOf(contracts[1].args?.[0]) },
        ]);
      }
      // The holdings/admin treasury reads the immutable fee mode once, then
      // alternates balanceOf/fees per voucher in the same Multicall3 snapshot.
      // The swap quote's own three reads put feesDecoupled second instead.
      if (contracts[0]?.functionName === "feesDecoupled" && contracts[2]?.functionName === "fees") {
        return Promise.resolve(
          contracts.map((contract, index) => {
            if (index === 0) {
              return { status: "success", result: poolTreasuryState.feesDecoupled };
            }
            if (index % 2 === 1) {
              return {
                status: "success",
                result: poolTreasuryState.balances[contract.address.toLowerCase()] ?? 0n,
              };
            }
            const tokenAddress = String(contract.args?.[0]).toLowerCase();
            return { status: "success", result: poolTreasuryState.fees[tokenAddress] ?? 0n };
          }),
        );
      }
      // The holdings panel's quoter rates, which tolerate a reverted read.
      if (allowFailure) {
        return Promise.resolve(contracts.map(() => ({ status: "success", result: 2_000_000n })));
      }
      return Promise.resolve([
        poolLiquidityBalance.value,
        poolTreasuryState.feesDecoupled,
        poolTreasuryState.fees[String(contracts[2]?.args?.[0]).toLowerCase()] ?? 0n,
      ]);
    },
  );
  publicClientCall.mockImplementation(({ data }: { data: Hex }) => {
    try {
      const decoded = decodeFunctionData({ abi: swapRouterQuoteExactInputAbi, data });
      return Promise.resolve({
        data: encodeFunctionResult({
          abi: swapRouterQuoteExactInputAbi,
          functionName: "quoteExactInput",
          result:
            (((decoded.args[1] * poolQuoteRate.numerator) / poolQuoteRate.denominator) *
              (1_000_000n - poolNetFee.ppm)) /
            1_000_000n,
        }),
      });
    } catch {
      try {
        const decoded = decodeFunctionData({ abi: swapRouterQuoteExactOutputAbi, data });
        return Promise.resolve({
          data: encodeFunctionResult({
            abi: swapRouterQuoteExactOutputAbi,
            functionName: "quoteExactOutput",
            result: (decoded.args[1] * poolQuoteRate.denominator) / poolQuoteRate.numerator,
          }),
        });
      } catch {
        try {
          const decoded = decodeFunctionData({ abi: poolQuoterReverseValueForAbi, data });
          const scaled = decoded.args[2] * poolQuoteRate.denominator;
          return Promise.resolve({
            data: encodeFunctionResult({
              abi: poolQuoterReverseValueForAbi,
              functionName: "reverseValueFor",
              result:
                scaled / poolQuoteRate.numerator +
                (scaled % poolQuoteRate.numerator === 0n ? 0n : 1n),
            }),
          });
        } catch {
          const decoded = decodeFunctionData({ abi: swapPoolGetQuoteAbi, data });
          return Promise.resolve({
            data: encodeFunctionResult({
              abi: swapPoolGetQuoteAbi,
              functionName: "getQuote",
              result: (decoded.args[2] * poolQuoteRate.numerator) / poolQuoteRate.denominator,
            }),
          });
        }
      }
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  publicClientCall.mockReset();
  publicClientMulticall.mockReset();
  publicClientRead.mockReset();
  swapMutateAsync.mockReset();
});

describe("pool voucher UI", () => {
  it("renders wallet image logos for pool vouchers instead of text glyphs", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="vouchers" />);

    expect(await screen.findByText("USD Coin")).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('img[src="https://wallet.example/usdc.png"]')).toBeTruthy();
      expect(document.querySelector('img[src="https://wallet.example/ttx.png"]')).toBeTruthy();
    });
  });

  it("lists every pool offering and shows the voucher symbol each one is priced in", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="offerings" />);

    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("Maize")).toBeTruthy();
    expect(within(panel).getByText("Tailoring")).toBeTruthy();

    // A pool's offerings come from different vouchers, so each tile has to say
    // which one it belongs to — the voucher page deliberately does not.
    const attributions = Array.from(panel.querySelectorAll('[data-slot="offering-voucher"]'));
    expect(attributions.map((element) => element.textContent)).toEqual(["USDC", "TTX"]);
    // The same blue the wallet's Pools action uses.
    expect(attributions.every((element) => element.className.includes("text-info"))).toBe(true);

    // The unit rides with the price now, so the tile says what the amount buys.
    expect(within(panel).getByText("25 USD / bag")).toBeTruthy();
    // An offering with no unit keeps the bare price rather than reading "per null".
    expect(within(panel).getByText("16 KES")).toBeTruthy();
    // The pool view is read-only for everyone. `OfferingsPanel` takes management
    // actions as a prop rather than deriving ownership, precisely so this screen
    // — which lists offerings from vouchers the viewer does not own — cannot
    // acquire write controls by accident.
    expect(within(panel).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(panel.querySelector(".grid")?.className).toContain("grid-cols-2");
  });

  it("opens the same offering sheet from a pool as from a voucher page", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="offerings" />);

    fireEvent.click(await screen.findByRole("button", { name: "View offering details: Maize" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("A sack of maize")).toBeTruthy();
    expect(within(dialog).getByText("25 USD / bag")).toBeTruthy();
    expect(within(dialog).getByText("Total").parentElement?.textContent).toContain("25 USD");
    expect(within(dialog).getByRole("button", { name: /Add to cart/ })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Increase quantity" }));
    expect(within(dialog).getByText("Total").parentElement?.textContent).toContain("50 USD");
  });

  it("puts offerings first and links the vouchers tab without stacking history", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="offerings" />);

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Offerings",
      "Vouchers",
      "Holdings",
      "Activity",
    ]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
      "pool-panel-offerings",
      "pool-panel-vouchers",
      "pool-panel-holdings",
      "pool-panel-activity",
    ]);
    // Only the selected panel is mounted, so every tab's target exists but one
    // panel is on screen.
    expect(screen.getByRole("tabpanel").id).toBe("pool-panel-offerings");
  });

  it("prices the pool's holdings and shows what each voucher has left before its cap", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="holdings" />);

    const panel = await screen.findByRole("tabpanel");
    expect(panel.id).toBe("pool-panel-holdings");

    // 30 of each voucher on chain, each priced at 2 USD. The pool's own unit
    // leads and the voucher's amount sits under it, so a steward reads the
    // figure they set the pool up in first.
    await waitFor(() => expect(within(panel).getAllByText("60.00 USD")).toHaveLength(2));
    expect(within(panel).getByText("30 USDC")).toBeTruthy();
    expect(within(panel).getByText("30 TTX")).toBeTruthy();

    // Rows are named, not tickered, with the pool's rate for the voucher under
    // the name — the same line the vouchers tab prints.
    expect(within(panel).getByText("USD Coin")).toBeTruthy();
    expect(within(panel).getByText("Trade Token")).toBeTruthy();
    expect(within(panel).getByText("1 USDC = 2 USD")).toBeTruthy();
    expect(within(panel).getByText("1 TTX = 2 USD")).toBeTruthy();

    // USDC carries a recorded cap of 40 tokens — 80 USD — against 30 held, so
    // 20 USD of credit is still on offer. TTX has no cap on record, which is not
    // the same as having none.
    expect(within(panel).getByText("20.00 of 80.00 USD available credit")).toBeTruthy();
    expect(within(panel).getByText("Limit not set")).toBeTruthy();
  });

  it("fills the deposit bar with the credit still on offer, not the credit used", async () => {
    // A steward who set a limit on an empty voucher is offering the whole of it.
    // A bar reading empty at that moment says the opposite of the figure printed
    // under it, which is what it used to do.
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="holdings" />);

    const panel = await screen.findByRole("tabpanel");
    const bar = await within(panel).findByRole("progressbar", {
      name: /USD Coin available credit/i,
    });
    // 30 of 40 held, so a quarter of the cap is left.
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
  });

  it("shows only withdrawable liquidity when the pool holds fees separately", async () => {
    poolTreasuryState.feesDecoupled = true;
    poolTreasuryState.balances[USDC_ADDRESS.toLowerCase()] = 7_430_000n;
    poolTreasuryState.fees[USDC_ADDRESS.toLowerCase()] = 3_930_000n;
    mockPoolRequests({ usdcBalance: "7430000" });

    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="holdings" />);

    const panel = await screen.findByRole("tabpanel");
    // 7.43 is the gross ERC-20 balance, but 3.93 is reserved for collection.
    // The row values the 3.50 the pool can release: 3.50 x 2 USD = 7.00 USD.
    await waitFor(() => expect(within(panel).getByText("7.00 USD")).toBeTruthy());
    expect(within(panel).getByText("3.5 USDC")).toBeTruthy();
    expect(within(panel).queryByText("7.43 USDC")).toBeNull();
    // Deposit caps still use the gross balance, exactly like mustWithinLimit:
    // (40 - 7.43) x 2 USD leaves 65.14 USD of credit.
    expect(within(panel).getByText("65.14 of 80.00 USD available credit")).toBeTruthy();
  });

  it("reassembles a pool swap from the two transfer legs the indexer records", async () => {
    // clc-core exposes swaps to non-superadmins only as their ERC-20 legs, so
    // the panel that does not rejoin them reports one trade as two movements.
    poolTransfers.value = [
      {
        id: 2,
        txHash: "0xswap",
        dateBlock: "2026-09-01T10:00:00Z",
        direction: "IN",
        counterpartyAddress: "0x9999999999999999999999999999999999999999",
        senderAddress: "0x9999999999999999999999999999999999999999",
        recipientAddress: POOL_ADDRESS,
        tokenAddress: USDC_ADDRESS,
        tokenSymbol: "USDC",
        tokenName: "USD Coin",
        tokenDecimals: 6,
        amount: "5000000",
        success: true,
      },
      {
        id: 1,
        txHash: "0xswap",
        dateBlock: "2026-09-01T10:00:00Z",
        direction: "OUT",
        counterpartyAddress: "0x9999999999999999999999999999999999999999",
        senderAddress: POOL_ADDRESS,
        recipientAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: TTX_ADDRESS,
        tokenSymbol: "TTX",
        tokenName: "Trade Token",
        tokenDecimals: 6,
        amount: "2500000",
        success: true,
      },
    ];
    mockPoolRequests();
    renderWithQueryClient(<PoolDetailPage poolAddress={POOL_ADDRESS} activeTab="activity" />);

    const panel = await screen.findByRole("tabpanel");
    expect(panel.id).toBe("pool-panel-activity");

    const rows = await within(panel).findAllByRole("button");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Swapped USDC for TTX");
    // The in/out marks the receipts use, rather than a bare + and −: the pool
    // gained one voucher and gave up a different one, and nothing about the
    // pair sums.
    expect(rows[0]?.textContent).toContain("+5 USDC");
    expect(rows[0]?.textContent).toContain("−2.5 TTX");

    // Opening the row spells the swap out with both legs and the addresses on
    // each side, which the single-transfer wallet sheet could not do.
    fireEvent.click(rows[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Pool received").parentElement?.textContent).toContain(
      "+5 USDC",
    );
    expect(within(dialog).getByText("Pool paid out").parentElement?.textContent).toContain(
      "−2.5 TTX",
    );
    expect(within(dialog).getByText("Trade Token")).toBeTruthy();
    expect(within(dialog).getByText("USD Coin")).toBeTruthy();
    expect(within(dialog).getByText("Confirmed")).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("link", { name: /view on block explorer/i })
        .getAttribute("href"),
    ).toContain("0xswap");
  });

  it("uses pool vouchers, wallet logos, and selected voucher balances in both swap fields", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const receiveField = await screen.findByRole("group", { name: "You receive" });
    const sendField = screen.getByRole("group", { name: "You send" });
    const receiveInput = within(receiveField).getByRole("textbox", {
      name: "You receive",
    }) as HTMLInputElement;
    const sendInput = within(sendField).getByRole("textbox", {
      name: "You send",
    }) as HTMLInputElement;

    expect(await within(receiveField).findByText("TTX")).toBeTruthy();
    expect(await within(sendField).findByText("USDC")).toBeTruthy();
    expect(await within(sendField).findByRole("button", { name: /max 12\.34/i })).toBeTruthy();
    expect(screen.getAllByRole("textbox")).toEqual([receiveInput, sendInput]);
    expect(receiveInput.value).toBe("");
    expect(sendInput.value).toBe("");
    expect(receiveInput.placeholder).toBe("0.00");
    expect(sendInput.placeholder).toBe("0.00");
    expect(document.activeElement).toBe(receiveInput);
    // You receive is the figure the screen is about and You send follows from it,
    // so they are deliberately not twins: the receive amount is larger and taller.
    expect(receiveInput.className).toContain("h-12");
    expect(receiveInput.className).toContain("text-[1.5rem]");
    expect(sendInput.className).toContain("text-[1rem]");
    expect(sendInput.className).not.toContain("h-12");
    expect(
      receiveField.compareDocumentPosition(sendField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The input's own outline is the only box: no panel is drawn around it.
    expect(receiveField.className).not.toContain("border");
    expect(sendField.className).not.toContain("border");
    // The pool's own catalog row supplies the icon. clc-core enriches an account
    // token's `iconUrl` from the same `vouchers.icon_url` column, so the two
    // agree in production and only the fixtures tell them apart — but the swap
    // screen reads the catalog directly, and a voucher the holder's balance page
    // has not reached still has to have a logo.
    expect(document.querySelector('img[src="https://pool.example/usdc.png"]')).toBeTruthy();
    expect(document.querySelector('img[src="https://pool.example/ttx.png"]')).toBeTruthy();
  });

  it("keeps a six-character voucher symbol whole in selectors of one shared width", async () => {
    mockPoolRequests({ usdcSymbol: "WLLS22", ttxSymbol: "WLLR22" });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const sendField = await screen.findByRole("group", { name: "You send" });
    const receiveField = screen.getByRole("group", { name: "You receive" });
    const sendSymbol = await within(sendField).findByText("WLLS22");
    const receiveSymbol = await within(receiveField).findByText("WLLR22");

    // A symbol is never clipped at this width, and the two selectors are the same
    // width whatever their symbols are: a fixed column, not `max-content`.
    expect(sendSymbol.className).not.toContain("truncate");
    const sendRow = sendSymbol.parentElement?.parentElement;
    const receiveRow = receiveSymbol.parentElement?.parentElement;
    expect(sendRow?.className).toContain("grid-cols-[8.5rem_minmax(0,1fr)]");
    expect(receiveRow?.className).toBe(sendRow?.className);
    expect(sendSymbol.parentElement?.className).toBe(receiveSymbol.parentElement?.className);
  });

  it("updates You receive from the real exact-input quote when You send changes", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "10" } });

    await waitFor(() => expect(toInput.value).toBe("20.00"));
    expect(screen.getByText("1 USDC = 2.00 TTX")).toBeTruthy();
    const call = publicClientCall.mock.calls.at(-2)?.[0] as { to: string; data: Hex };
    // `SWAP_ROUTER_ADDRESS` in `hooks/use-pool-swap-quote.ts`. Left asserting the
    // Celo router when 197d2ee pointed the hook at the Gnosis one, which is what
    // has been failing here since.
    expect(call.to).toBe("0x16e3F29dDe22eF75C081A764C4d200Cd48647bcC");
    expect(decodeFunctionData({ abi: swapRouterQuoteExactInputAbi, data: call.data }).args).toEqual(
      [[{ pool: POOL_ADDRESS, tokenIn: USDC_ADDRESS, tokenOut: TTX_ADDRESS }], 10_000_000n],
    );
  });

  it("quotes only the settled send amount while the user types", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement;
    // The field opens empty now, so the settled state this asserts against has to
    // be typed rather than assumed.
    fireEvent.change(fromInput, { target: { value: "25" } });
    await waitFor(() => expect(toInput.value).toBe("50.00"));
    publicClientCall.mockClear();

    fireEvent.change(fromInput, { target: { value: "1" } });
    fireEvent.change(fromInput, { target: { value: "2" } });
    fireEvent.change(fromInput, { target: { value: "3" } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(publicClientCall).not.toHaveBeenCalled();
    await waitFor(() => expect(toInput.value).toBe("6.00"));
    expect(publicClientCall).toHaveBeenCalledTimes(2);
  });

  it("groups a settled amount without requoting the same raw value", async () => {
    mockPoolRequests({ usdcBalance: "10000000000" });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "10000" } });

    await waitFor(() => expect(toInput.value).toBe("20,000.00"));
    publicClientCall.mockClear();
    fireEvent.blur(fromInput);

    expect(fromInput.value).toBe("10,000.00");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(publicClientCall).not.toHaveBeenCalled();

    fireEvent.focus(fromInput);
    expect(fromInput.value).toBe("10000.00");
  });

  it("starts in exact-output mode and updates You send when You receive changes", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const toInput = (await screen.findByRole("textbox", {
      name: "You receive",
    })) as HTMLInputElement;
    const fromInput = screen.getByRole("textbox", { name: "You send" }) as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: "8" } });

    await waitFor(() => {
      expect(fromInput.value).toBe("4.00");
      expect(toInput.value).toBe("8");
    });
    const call = publicClientCall.mock.calls.at(-2)?.[0] as { data: Hex };
    expect(
      decodeFunctionData({ abi: swapRouterQuoteExactOutputAbi, data: call.data }).args,
    ).toEqual([[{ pool: POOL_ADDRESS, tokenIn: USDC_ADDRESS, tokenOut: TTX_ADDRESS }], 8_000_000n]);
  });

  it("blocks a quoted swap when the pool has no output-token liquidity", async () => {
    poolLiquidityBalance.value = 0n;
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });

    expect(await screen.findByText(/this pool has no ttx available to swap/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the pool's available output liquidity when it cannot fill the quote", async () => {
    poolLiquidityBalance.value = 1_000_000n;
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });

    expect(await screen.findByText(/this pool only has 1\.00 ttx available to swap/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("prevents swapping more than the selected send balance and Max requotes it", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "25" } });
    await waitFor(() => expect(toInput.value).toBe("50.00"));
    expect(screen.getByText(/amount exceeds your balance/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /max 12\.34/i }));

    await waitFor(() => {
      expect(fromInput.value).toBe("12.34");
      expect(toInput.value).toBe("24.68");
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
  });

  it("clamps Max to output liquidity after converting it into the input voucher", async () => {
    poolQuoteRate.numerator = 1n;
    poolTreasuryState.balances[TTX_ADDRESS.toLowerCase()] = 55_000_000n;
    poolLiquidityBalance.value = 55_000_000n;
    mockPoolRequests({ usdcBalance: "995000000" });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const max = await screen.findByRole("button", { name: /max 55\.00$/i });
    expect(screen.queryByRole("button", { name: /max 995\.00$/i })).toBeNull();
    fireEvent.click(max);

    await waitFor(() => {
      expect((screen.getByRole("textbox", { name: "You send" }) as HTMLInputElement).value).toBe(
        "55.00",
      );
      expect((screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement).value).toBe(
        "55.00",
      );
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
  });

  it("excludes reserved output fees from the liquidity available to Max", async () => {
    poolQuoteRate.numerator = 1n;
    poolTreasuryState.feesDecoupled = true;
    poolTreasuryState.balances[TTX_ADDRESS.toLowerCase()] = 100_000_000n;
    poolTreasuryState.fees[TTX_ADDRESS.toLowerCase()] = 45_000_000n;
    poolLiquidityBalance.value = 100_000_000n;
    mockPoolRequests({ usdcBalance: "995000000" });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    expect(await screen.findByRole("button", { name: /max 55\.00$/i })).toBeTruthy();
  });

  it("opens an in-place confirmation sheet instead of a review page", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /confirm swap/i })).toBeTruthy();
    const receiveRow = within(dialog).getByText("You receive").parentElement;
    const sendRow = within(dialog).getByText("You send").parentElement;
    expect(receiveRow?.textContent).toContain("2.00 TTX");
    expect(sendRow?.textContent).toContain("1.00 USDC");
    expect(receiveRow?.nextElementSibling).toBe(sendRow);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs the atomic pool batch and goes directly to the tracked receipt", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    await waitFor(() => {
      expect(swapMutateAsync).toHaveBeenCalledWith({
        mode: "exact-input",
        senderAddress: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
        path: [{ poolAddress: POOL_ADDRESS, tokenIn: USDC_ADDRESS, tokenOut: TTX_ADDRESS }],
        hopAmountIns: ["1000000"],
        includeAuthorization: false,
      });
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/pools/$poolAddress/swap/receipt",
      params: { poolAddress: POOL_ADDRESS },
      search: {
        trackingId: "swap-tracking-1",
        sendAmount: "1.00",
        sendSymbol: "USDC",
        receiveAmount: "2.00",
        receiveSymbol: "TTX",
        // Carried so the receipt can prefill a send of what was swapped out; a
        // symbol alone would not identify the token to send.
        receiveToken: TTX_ADDRESS,
        poolName: "Trade Pool",
      },
    });
  });

  it("relays the full raw voucher balance when Max is selected", async () => {
    mockPoolRequests({ usdcBalance: "12345678" });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    fireEvent.click(await screen.findByRole("button", { name: /max 12\.34/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    await waitFor(() => {
      expect(swapMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ hopAmountIns: ["12345678"] }),
      );
    });
  });

  it("relays the required send amount for an exact-output swap", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const toInput = (await screen.findByRole("textbox", {
      name: "You receive",
    })) as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: "8" } });
    await waitFor(() => {
      expect((screen.getByRole("textbox", { name: "You send" }) as HTMLInputElement).value).toBe(
        "4.00",
      );
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    await waitFor(() => {
      expect(swapMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "exact-output",
          hopAmountIns: ["4000000"],
        }),
      );
    });
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/pools/$poolAddress/swap/receipt",
        search: expect.objectContaining({ receiveAmount: "8.00", receiveSymbol: "TTX" }),
      }),
    );
  });

  it("rechecks pool liquidity before signing the batch", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    poolLiquidityBalance.value = 0n;
    fireEvent.click(screen.getByRole("button", { name: /^confirm swap$/i }));

    expect(await screen.findByText(/pool liquidity changed/i)).toBeTruthy();
    expect(swapMutateAsync).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps relay failures visible in the confirmation sheet", async () => {
    swapTransferState.error = new Error("Relay failed");
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "1" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/relay failed/i);
  });

  it("shows quote failures and prevents swapping an unquoted amount", async () => {
    publicClientCall.mockRejectedValue(new Error("RPC unavailable"));
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    fireEvent.change(await screen.findByRole("textbox", { name: "You send" }), {
      target: { value: "1" },
    });

    expect(await screen.findByRole("alert", { name: /couldn't estimate this swap/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("offers every voucher you hold in the You send picker, not just the first one", async () => {
    // The reported bug: the picker listed the pool's catalog rows and preselected
    // whichever happened to be first, so a holder saw one voucher — often one
    // they held none of — instead of their own shelf.
    mockPoolRequests({ withUnheldVoucher: true });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromField = await screen.findByRole("group", { name: "You send" });
    await within(fromField).findByText("USDC");
    fireEvent.click(within(fromField).getByRole("button", { name: "USDC" }));
    expect(screen.getByRole("heading", { name: "You send" })).toBeTruthy();

    const rows = await screen.findAllByRole("button", { name: /USDC|TTX|RAMBO/ });
    // Held first, largest holding leading: 12.34 USDC, then 9 TTX, then the one
    // the holder has none of.
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("USDC"),
      expect.stringContaining("TTX"),
      expect.stringContaining("RAMBO"),
    ]);
    expect(rows[0]?.textContent).toContain("12.34");
    expect(rows[1]?.textContent).toContain("9.00");
  });

  it("keeps a voucher you hold none of visible, under Not held and unselectable", async () => {
    // Hiding it would tell a holder who knows this pool takes RAMBO that it no
    // longer does. Listing it dimmed says the pool is fine and their wallet is
    // empty of it.
    mockPoolRequests({ withUnheldVoucher: true });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromField = await screen.findByRole("group", { name: "You send" });
    await within(fromField).findByText("USDC");
    fireEvent.click(within(fromField).getByRole("button", { name: "USDC" }));

    expect(await screen.findByText("Not held")).toBeTruthy();
    const unheld = screen.getByRole("button", { name: /RAMBO/ });
    expect(unheld.hasAttribute("disabled")).toBe(true);
  });

  it("preselects the largest holding the pool will take, not the first catalog row", async () => {
    // TTX is second in the catalog but the bigger holding, so it leads.
    mockPoolRequests({ usdcBalance: "1000000" });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromField = await screen.findByRole("group", { name: "You send" });
    expect(await within(fromField).findByText("TTX")).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "You receive" })).getByText("USDC"),
    ).toBeTruthy();
  });

  it("says when the pool is full of a voucher instead of quietly dropping it", async () => {
    // The pool holds 30 USDC against a cap of 30, so `mustWithinLimit` reverts
    // `LimitExceeded` on any deposit — worth knowing before a passkey ceremony.
    poolTokenLimit.overrides = { [USDC_ADDRESS.toLowerCase()]: 30_000_000n };
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromField = await screen.findByRole("group", { name: "You send" });
    // USDC is the larger holding but cannot be deposited, so TTX leads instead.
    expect(await within(fromField).findByText("TTX")).toBeTruthy();
    fireEvent.click(within(fromField).getByRole("button", { name: "TTX" }));

    const full = await screen.findByRole("button", { name: /USDC/ });
    expect(full.textContent).toContain("This pool is full of it");
    expect(full.hasAttribute("disabled")).toBe(true);
  });

  it("blocks an amount the pool has no room for, and clamps Max to that room", async () => {
    // 30 USDC held against a cap of 34 leaves the pool room for 4, well under the
    // holder's balance.
    poolTokenLimit.overrides = { [USDC_ADDRESS.toLowerCase()]: 34_000_000n };
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    expect(await screen.findByRole("button", { name: /max 4\.00$/i })).toBeTruthy();

    fireEvent.change(fromInput, { target: { value: "10" } });
    expect(await screen.findByText(/this pool can only take 4\.00 more usdc/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /max 4\.00$/i }));
    await waitFor(() => {
      expect(fromInput.value).toBe("4.00");
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
  });

  it("offers the pool's liquidity in the You receive picker, minus the send token", async () => {
    mockPoolRequests({ withUnheldVoucher: true });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const toField = await screen.findByRole("group", { name: "You receive" });
    await within(toField).findByText("TTX");
    fireEvent.click(within(toField).getByRole("button", { name: "TTX" }));
    expect(screen.getByRole("heading", { name: "You receive" })).toBeTruthy();

    const rows = await screen.findAllByRole("button", { name: /USDC|TTX|RAMBO/ });
    // USDC is the selected From, so it cannot also be the output.
    expect(rows.every((row) => !row.textContent?.includes("USDC"))).toBe(true);
    // The pool holds 30 of each, which is what a holder is choosing between here
    // — their own balance is irrelevant on this side.
    expect(rows.every((row) => row.textContent?.includes("30.00"))).toBe(true);
    expect(rows.some((row) => row.textContent?.includes("RAMBO"))).toBe(true);
  });

  it("offers a voucher the pool's registry admits even though the catalog never listed it", async () => {
    // The catalog is a projection and omits members — a token seeded when the pool
    // was published, or one the indexer has not reached. The registry is what
    // `SwapPool` checks, so it decides the menu.
    poolRegistry.address = REGISTRY_ADDRESS;
    poolRegistry.entries = [USDC_ADDRESS, TTX_ADDRESS, PLANK_ADDRESS];
    poolRegistry.metadata = {
      [PLANK_ADDRESS.toLowerCase()]: { symbol: "PLANK", name: "Plank Token", decimals: 6 },
    };
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const toField = await screen.findByRole("group", { name: "You receive" });
    await within(toField).findByText("TTX");
    fireEvent.click(within(toField).getByRole("button", { name: "TTX" }));

    const plank = await screen.findByRole("button", { name: /PLANK/ });
    expect(plank.textContent).toContain("Plank Token");
    expect(plank.textContent).toContain("30.00");
    expect(plank.hasAttribute("disabled")).toBe(false);
  });

  it("drops a catalog voucher the registry does not admit", async () => {
    // `SwapPool` runs `have(token)` on both legs, so offering it would only cost the
    // holder a signature that reverts `UnauthorizedToken`.
    poolRegistry.address = REGISTRY_ADDRESS;
    poolRegistry.entries = [USDC_ADDRESS, TTX_ADDRESS];
    mockPoolRequests({ withUnheldVoucher: true });
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const sendField = await screen.findByRole("group", { name: "You send" });
    await within(sendField).findByText("USDC");
    fireEvent.click(within(sendField).getByRole("button", { name: "USDC" }));

    const rows = await screen.findAllByRole("button", { name: /USDC|TTX|RAMBO/ });
    expect(rows.some((row) => row.textContent?.includes("RAMBO"))).toBe(false);
  });

  it("says the registry could not be read instead of showing a shorter menu", async () => {
    poolRegistry.address = REGISTRY_ADDRESS;
    poolRegistry.entries = [USDC_ADDRESS, TTX_ADDRESS];
    mockPoolRequests();
    publicClientRead.mockRejectedValue(new Error("rpc down"));
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    expect(await screen.findByText(/couldn't check which vouchers this pool takes/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the fees the pool and protocol take, in the voucher you receive", async () => {
    poolNetFee.ppm = 20_000n;
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    fireEvent.change(await screen.findByRole("textbox", { name: "You send" }), {
      target: { value: "25" },
    });

    // 25 USDC is 50.00 TTX gross; 2% comes off, so 49.00 arrives and 1.00 is fees.
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement).value).toBe(
        "49.00",
      ),
    );
    expect(screen.getByText("Fees").parentElement?.textContent).toContain("1.00 TTX");
    expect(screen.queryByText(/fee calculated at confirmation/i)).toBeNull();
  });

  it("states the most you can receive once every fee is out", async () => {
    poolNetFee.ppm = 20_000n;
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    // Max send is the 12.34 USDC held (24.68 TTX gross, under the pool's 30.00),
    // and the contract's own net figure for that is 2% lower.
    expect(await screen.findByText(/you can receive up to 24\.18 TTX/i)).toBeTruthy();
  });

  it("fills the most you can receive when the hint is tapped, spending the pinned maximum", async () => {
    poolNetFee.ppm = 20_000n;
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /you can receive up to 24\.18 TTX/i }),
    );

    // Same request as Max on the send side, so the amount sent is the exact raw
    // maximum and never a rounded-up figure that could overrun the balance.
    await waitFor(() => {
      expect((screen.getByRole("textbox", { name: "You send" }) as HTMLInputElement).value).toBe(
        "12.34",
      );
      expect((screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement).value).toBe(
        "24.18",
      );
      expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
    });
  });

  it("says so when you hold nothing this pool takes", async () => {
    holderBalances.value = {};
    vi.stubGlobal("fetch", vi.fn());
    mockPoolRequests();
    holderBalances.value = {};
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    expect(await screen.findByText(/you don't hold any voucher this pool takes/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(true);
  });

  it("reverses the selected vouchers without changing either amount", async () => {
    mockPoolRequests();
    renderWithQueryClient(<PoolSwapPage poolAddress={POOL_ADDRESS} />);

    const fromInput = (await screen.findByRole("textbox", {
      name: "You send",
    })) as HTMLInputElement;
    const toInput = screen.getByRole("textbox", { name: "You receive" }) as HTMLInputElement;
    // Reversing is offered only once both sides are known to be swappable, so the
    // selections have to have settled before the button means anything.
    await within(screen.getByRole("group", { name: "You send" })).findByText("USDC");
    await within(screen.getByRole("group", { name: "You send" })).findByRole("button", {
      name: /max 12\.34/i,
    });
    fireEvent.change(fromInput, { target: { value: "17.25" } });
    await waitFor(() => expect(toInput.value).toBe("34.50"));
    const amountsBefore = [fromInput.value, toInput.value];

    fireEvent.click(screen.getByRole("button", { name: /reverse swap direction/i }));

    expect(within(screen.getByRole("group", { name: "You send" })).getByText("TTX")).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "You receive" })).getByText("USDC"),
    ).toBeTruthy();
    expect([fromInput.value, toInput.value]).toEqual(amountsBefore);
    expect(
      within(screen.getByRole("group", { name: "You send" })).queryByRole("button", {
        name: /max 12\.34/i,
      }),
    ).toBeNull();
    expect(
      await within(screen.getByRole("group", { name: "You send" })).findByRole("button", {
        name: /max 9/i,
      }),
    ).toBeTruthy();
  });
});
