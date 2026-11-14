import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { decodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import type { OracleFeed } from "@clc/api/features/oracle-feeds/client";
import type { PoolVoucherOracle } from "#/features/pools/hooks/use-pool-quoter";
import { oracleFeedKeys } from "@clc/api/features/oracle-feeds/queries";
import {
  limiterSetLimitForAbi,
  oracleQuoterSetOracleAbi,
  oracleQuoterSetOracleWithStalenessAbi,
  relativeQuoterSetPriceIndexValueAbi,
  tokenIndexAddAbi,
  tokenIndexRemoveAbi,
} from "@clc/core/features/pool-admin/logic";

const POOL = "0x8e0a000000000000000000000000000000000b41";
const TOKEN = "0x3aa7000000000000000000000000000000000102";
const REGISTRY = "0x61a8000000000000000000000000000000007001";
const LIMITER = "0x4d90000000000000000000000000000000000a1c";
const QUOTER = "0xb91c000000000000000000000000000000007d20";
const CANDIDATE = "0x2211000000000000000000000000000000000909";
const EUR_FEED = "0xab70BCB260073d036d1660201e9d5405F5829b7a";
const UNREGISTERED_FEED = "0x26C31ac71010aF62E6B486D1132E266D6298857D";

const EUR: OracleFeed = {
  id: "7",
  chainId: 100,
  name: "EUR",
  address: EUR_FEED,
  description: "EUR / USD",
  decimals: 8,
  maxStalenessSeconds: 93_600,
};

const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  quoterKind: { kind: "relative", isPending: false } as {
    kind: string;
    isPending: boolean;
  },
  searchResults: [] as { id: string; address: string; name: string; symbol: string }[],
  suggestions: {
    issued: {
      rows: [] as { id: string; address: `0x${string}`; name: string; symbol: string }[],
      status: "ready" as "idle" | "loading" | "ready" | "error",
      completeness: "complete" as "complete" | "partial",
      retry: vi.fn(),
    },
    holdings: {
      rows: [] as { id: string; address: `0x${string}`; name: string; symbol: string }[],
      status: "ready" as "idle" | "loading" | "ready" | "error",
      completeness: "complete" as "complete" | "partial",
      retry: vi.fn(),
    },
    deposited: {
      rows: [] as { id: string; address: `0x${string}`; name: string; symbol: string }[],
      status: "ready" as "idle" | "loading" | "ready" | "error",
      completeness: "complete" as "complete" | "partial",
      retry: vi.fn(),
    },
  },
  membership: {
    data: false as boolean | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  registry: {
    data: ["0x3aa7000000000000000000000000000000000102"] as string[] | undefined,
    isPending: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  },
  rates: {
    data: new Map<string, bigint>(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  oracles: {
    data: new Map<string, PoolVoucherOracle>() as Map<string, PoolVoucherOracle> | undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  rounds: {
    data: new Map<
      string,
      { status: "ready"; price: string; stale: boolean } | { status: "unreadable" }
    >(),
    isPending: false,
    fetchStatus: "idle",
  },
  listFeeds: vi.fn(),
  realOracleRead: false,
  multicall: vi.fn(),
  roundFeeds: vi.fn(),
  treasury: {
    data: new Map<
      string,
      { balanceRaw: string; feesRaw: string; withdrawableRaw: string; limitRaw: string | null }
    >(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("#/features/pools/hooks/use-pool-admin", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePoolAdminRelay: () => ({ mutateAsync: mocks.relay, isPending: false }),
}));

// The feed registry runs through the real query lifecycle; only its client is
// faked. The chain reads stay mocked.
vi.mock("#/features/pools/hooks/use-pool-quoter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return {
    ...actual,
    usePoolQuoterKind: () => mocks.quoterKind,
    usePoolVoucherRatesByAddress: () => mocks.rates,
    // The real read, on the test's QueryClient, where a case needs its lifecycle.
    usePoolVoucherOracles: (...args: unknown[]) =>
      mocks.realOracleRead ? actual.usePoolVoucherOracles?.(...args) : mocks.oracles,
    useOracleFeedRounds: (feeds: unknown) => {
      mocks.roundFeeds(feeds);
      return mocks.rounds;
    },
  };
});

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useClient: () => ({ uid: "test-client" }),
}));

vi.mock("viem/actions", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  multicall: (_client: unknown, args: unknown) => mocks.multicall(args),
}));

vi.mock("#/lib/api/oracle-feeds", () => ({
  oracleFeedsClient: { listOracleFeeds: mocks.listFeeds },
}));

vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: () => mocks.treasury,
}));

vi.mock("#/features/pools/hooks/use-pool-registry", () => ({
  poolTokenRegistryAddress: (value: UserPool | null | undefined) =>
    value?.tokenRegistryAddress ?? null,
  usePoolRegistryTokens: () => mocks.registry,
  usePoolTokenMembership: () => mocks.membership,
}));

vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: () => ({
    query: "",
    setQuery: vi.fn(),
    results: mocks.searchResults,
    status: "ready",
    retry: vi.fn(),
  }),
}));

vi.mock("#/features/pools/hooks/use-approval-suggestions", () => ({
  useApprovalSuggestions: () => mocks.suggestions,
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: { decimals: 6 }, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { poolQuoterQueryKeys } from "#/features/pools/hooks/use-pool-quoter";
import { CHAIN_ID } from "#/lib/chain";
import { PoolVoucherSheet } from "./pool-voucher-sheet";

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "7",
    chainId: 100,
    address: POOL,
    name: "Kilifi Traders",
    symbol: "KLF",
    ownerAddress: "0xDeF0000000000000000000000000000000000456",
    feePpm: 10_000,
    feeAddress: null,
    tokenRegistryAddress: REGISTRY,
    limiterAddress: LIMITER,
    quoterAddress: QUOTER,
    quoterType: "relative",
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "Traders around the Kilifi market.",
    unitOfAccount: "KES",
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
    voucherCount: 1,
    tags: [],
    ...overrides,
  };
}

function poolVoucher(overrides: Partial<PoolVoucher> = {}): PoolVoucher {
  return {
    id: "v1",
    chainId: 100,
    name: "Pepas Voucher",
    description: "",
    symbol: "PEPAS",
    tokenAddress: TOKEN,
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
    tokenLimit: "200000000",
    oracleFeedId: null,
    oracleName: null,
    oracleAddress: null,
    offerCount: 0,
    availableOfferCount: 0,
    tags: [],
    ...overrides,
  };
}

function relayedCalls(): CaliburCall[] {
  return mocks.relay.mock.calls[0]?.[0] as CaliburCall[];
}

function renderSheet(
  node: ReactNode,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** Base UI commits an unhighlighted item only for a touch pointer; jsdom fires no hover. */
async function chooseFeed(dialog: HTMLElement, name: string | RegExp) {
  fireEvent.click(within(dialog).getByLabelText("Price feed"));
  const option = await screen.findByRole("option", { name });
  fireEvent.pointerDown(option, { pointerType: "touch" });
  fireEvent.click(option);
}

const noFeed = {
  aggregatorAddress: null,
  maxStalenessSeconds: 0n,
  globalMaxStalenessSeconds: 86_400n,
};

function onChainFeed(
  token: string,
  aggregatorAddress: `0x${string}` | null,
  maxStalenessSeconds = 0n,
) {
  mocks.oracles.data?.set(token.toLowerCase(), {
    ...noFeed,
    aggregatorAddress,
    maxStalenessSeconds,
  });
}

/** Search results stay hidden until the field has a real term. */
function searchVouchers(dialog: HTMLElement, term = "ju") {
  fireEvent.change(within(dialog).getByLabelText("Search vouchers"), {
    target: { value: term },
  });
}

beforeEach(() => {
  mocks.relay.mockReset();
  mocks.relay.mockResolvedValue({ trackingId: "t1", txHash: `0x${"ab".repeat(32)}` });
  mocks.quoterKind = { kind: "relative", isPending: false };
  mocks.membership = { data: false, isPending: false, isError: false, refetch: vi.fn() };
  mocks.registry = {
    data: [TOKEN],
    isPending: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  };
  mocks.rates = {
    data: new Map([
      [TOKEN.toLowerCase(), 2_500_000n],
      [CANDIDATE.toLowerCase(), 1_000_000n],
    ]),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  mocks.treasury = {
    data: new Map([
      [
        TOKEN.toLowerCase(),
        {
          balanceRaw: "50000000",
          feesRaw: "0",
          withdrawableRaw: "50000000",
          limitRaw: "200000000",
        },
      ],
      [
        CANDIDATE.toLowerCase(),
        { balanceRaw: "0", feesRaw: "0", withdrawableRaw: "0", limitRaw: "0" },
      ],
    ]),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  mocks.oracles = {
    data: new Map([
      [TOKEN.toLowerCase(), noFeed],
      [CANDIDATE.toLowerCase(), noFeed],
    ]),
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  mocks.rounds = {
    data: new Map([[EUR_FEED, { status: "ready" as const, price: "1.1081", stale: false }]]),
    isPending: false,
    fetchStatus: "idle",
  };
  mocks.listFeeds.mockReset();
  mocks.realOracleRead = false;
  mocks.multicall.mockReset();
  mocks.roundFeeds.mockReset();
  mocks.listFeeds.mockResolvedValue([EUR]);
  mocks.searchResults = [];
  mocks.suggestions = {
    issued: { rows: [], status: "ready", completeness: "complete", retry: vi.fn() },
    holdings: { rows: [], status: "ready", completeness: "complete", retry: vi.fn() },
    deposited: { rows: [], status: "ready", completeness: "complete", retry: vi.fn() },
  };
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PoolVoucherSheet approving", () => {
  it("registers, caps and prices a searched voucher in one batch", async () => {
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    // The equation reads in the pool's unit of account, not the voucher's.
    expect(within(dialog).getByText("1 JUAN")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Exchange rate"), { target: { value: "2.5" } });
    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    expect(decodeFunctionData({ abi: tokenIndexAddAbi, data: calls[0]!.data })).toEqual({
      functionName: "add",
      args: [CANDIDATE],
    });
    // 500 KES of headroom at 2.5 KES per voucher is 200 vouchers.
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[1]!.data })).toEqual({
      functionName: "setLimitFor",
      args: [CANDIDATE, POOL, 200000000n],
    });
    expect(
      decodeFunctionData({ abi: relativeQuoterSetPriceIndexValueAbi, data: calls[2]!.data }),
    ).toEqual({ functionName: "setPriceIndexValue", args: [CANDIDATE, 2500000n] });
  });

  it("opens at parity with no credit limit, and submits that pair unchanged", async () => {
    // Parity asserts nothing about the voucher, and a zero limit approves it
    // without committing the pool to hold any of it yet. Both are the steward's
    // to change; neither is a number this screen invented for them.
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    expect((within(dialog).getByLabelText("Exchange rate") as HTMLInputElement).value).toBe("1");
    expect((within(dialog).getByLabelText("Credit limit") as HTMLInputElement).value).toBe("0");
    expect(within(dialog).getByText("0.00 JUAN")).toBeTruthy();
    expect(within(dialog).getByText("0.00 KES")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    // Zero reaches the limiter rather than being rejected as invalid — the
    // contract stores it, and it is what the steward was shown.
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[1]!.data })).toEqual({
      functionName: "setLimitFor",
      args: [CANDIDATE, POOL, 0n],
    });
    expect(
      decodeFunctionData({ abi: relativeQuoterSetPriceIndexValueAbi, data: calls[2]!.data }),
    ).toEqual({ functionName: "setPriceIndexValue", args: [CANDIDATE, 1000000n] });
  });

  it("shows deposits and retained configuration for a voucher missing from the catalog", async () => {
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
    mocks.rates.data = new Map([[CANDIDATE.toLowerCase(), 2_000_000n]]);
    mocks.treasury.data = new Map([
      [
        CANDIDATE.toLowerCase(),
        {
          balanceRaw: "7500000",
          feesRaw: "500000",
          withdrawableRaw: "7000000",
          limitRaw: "100000000",
        },
      ],
    ]);
    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    expect((within(dialog).getByLabelText("Exchange rate") as HTMLInputElement).value).toBe("2");
    expect((within(dialog).getByLabelText("Credit limit") as HTMLInputElement).value).toBe("200");
    // The gross 7.5 voucher balance is shown, not the fee-adjusted 7.0 liquidity.
    expect(within(dialog).getByText("7.50 JUAN")).toBeTruthy();
    expect(within(dialog).getByText("15.00 KES")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Exchange rate"), { target: { value: "4" } });
    expect(within(dialog).getByText("30.00 KES")).toBeTruthy();
  });

  it("refuses a quoter this screen cannot configure", async () => {
    mocks.quoterKind = { kind: "decimal", isPending: false };
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
    renderSheet(
      <PoolVoucherSheet
        pool={pool({ quoterType: "decimal" })}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();
    expect(
      (within(dialog).getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("offers unapproved holdings, deposits, then issued vouchers and filters registry members", async () => {
    const issued = "0x1111000000000000000000000000000000000001" as const;
    const held = "0x2222000000000000000000000000000000000002" as const;
    const deposited = "0x3333000000000000000000000000000000000003" as const;
    mocks.suggestions = {
      issued: {
        rows: [{ id: "own", address: issued, name: "Will", symbol: "WLLR" }],
        status: "ready",
        completeness: "complete",
        retry: vi.fn(),
      },
      holdings: {
        rows: [
          { id: "held", address: held, name: "Sarafu", symbol: "SRF" },
          { id: "approved", address: TOKEN, name: "Pepas Voucher", symbol: "PEPAS" },
        ],
        status: "ready",
        completeness: "complete",
        retry: vi.fn(),
      },
      deposited: {
        rows: [
          { id: "held-again", address: held, name: "Sarafu", symbol: "SRF" },
          { id: "deposit", address: deposited, name: "Waiting Voucher", symbol: "WAIT" },
          { id: "approved-again", address: TOKEN, name: "Pepas Voucher", symbol: "PEPAS" },
        ],
        status: "ready",
        completeness: "complete",
        retry: vi.fn(),
      },
    };
    mocks.searchResults = [
      { id: "m1", address: TOKEN, name: "Pepas Voucher", symbol: "PEPAS" },
      { id: "m2", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    const heldGroup = within(within(dialog).getByRole("region", { name: "Vouchers you hold" }));
    const depositGroup = within(
      within(dialog).getByRole("region", { name: "Deposited in this pool" }),
    );
    const issuedGroup = within(within(dialog).getByRole("region", { name: "Vouchers you issued" }));
    expect(issuedGroup.getByRole("button", { name: /Will/ })).toBeTruthy();
    expect(heldGroup.getByRole("button", { name: /Sarafu/ })).toBeTruthy();
    expect(heldGroup.queryByRole("button", { name: /Pepas Voucher/ })).toBeNull();
    expect(depositGroup.getByRole("button", { name: /Waiting Voucher/ })).toBeTruthy();
    expect(depositGroup.queryByRole("button", { name: /Sarafu/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Juan's Voucher/ })).toBeNull();

    const text = dialog.textContent ?? "";
    expect(text.indexOf("Vouchers you hold")).toBeLessThan(text.indexOf("Deposited in this pool"));
    expect(text.indexOf("Deposited in this pool")).toBeLessThan(
      text.indexOf("Vouchers you issued"),
    );

    searchVouchers(dialog);
    expect(within(dialog).queryByRole("button", { name: /Pepas Voucher/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Will/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Juan's Voucher/ })).toBeTruthy();
  });

  it("keeps usable suggestion groups visible when holdings are unavailable", async () => {
    const issued = "0x1111000000000000000000000000000000000001" as const;
    const issuedRetry = vi.fn();
    const holdingsRetry = vi.fn();
    mocks.suggestions = {
      issued: {
        rows: [{ id: "own", address: issued, name: "Will", symbol: "WLLR" }],
        status: "ready",
        completeness: "complete",
        retry: issuedRetry,
      },
      holdings: {
        rows: [],
        status: "error",
        completeness: "partial",
        retry: holdingsRetry,
      },
      deposited: { rows: [], status: "ready", completeness: "complete", retry: vi.fn() },
    };

    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(within(dialog).getByRole("region", { name: "Vouchers you issued" })).getByRole(
        "button",
        { name: /Will/ },
      ),
    ).toBeTruthy();
    const holdings = within(within(dialog).getByRole("region", { name: "Vouchers you hold" }));
    expect(holdings.getByText("Unavailable")).toBeTruthy();
    expect(within(dialog).queryByText("Couldn't load vouchers.")).toBeNull();

    fireEvent.click(holdings.getByRole("button", { name: "Retry" }));
    expect(holdingsRetry).toHaveBeenCalledOnce();
    expect(issuedRetry).not.toHaveBeenCalled();
  });

  it("shows partial fallback suggestions with a targeted retry", async () => {
    const holdingsRetry = vi.fn();
    mocks.suggestions.holdings = {
      rows: [{ id: "held", address: CANDIDATE, name: "Recent", symbol: "RCNT" }],
      status: "ready",
      completeness: "partial",
      retry: holdingsRetry,
    };

    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );

    const holdings = within(
      within(await screen.findByRole("dialog")).getByRole("region", {
        name: "Vouchers you hold",
      }),
    );
    expect(holdings.getByRole("button", { name: /Recent/ })).toBeTruthy();
    expect(holdings.getByText("Showing recent vouchers only.")).toBeTruthy();
    fireEvent.click(holdings.getByRole("button", { name: "Retry" }));
    expect(holdingsRetry).toHaveBeenCalledOnce();
  });

  it("does not expose candidates until registry membership is verified", async () => {
    mocks.registry = {
      data: undefined,
      isPending: true,
      isSuccess: false,
      isError: false,
      refetch: vi.fn(),
    };
    mocks.suggestions.holdings = {
      rows: [{ id: "held", address: CANDIDATE, name: "Recent", symbol: "RCNT" }],
      status: "ready",
      completeness: "complete",
      retry: vi.fn(),
    };

    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Checking approved vouchers…")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Recent/ })).toBeNull();
  });

  it("keeps the picker blocked and retries when registry enumeration fails", async () => {
    const retry = vi.fn();
    mocks.registry = {
      data: undefined,
      isPending: false,
      isSuccess: false,
      isError: true,
      refetch: retry,
    };
    mocks.searchResults = [
      { id: "approved", address: TOKEN, name: "Pepas Voucher", symbol: "PEPAS" },
    ];

    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Couldn't check which vouchers are already approved."),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Pepas Voucher/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("filters a registry member even when the catalog has not projected it", async () => {
    mocks.searchResults = [
      { id: "approved", address: TOKEN, name: "Pepas Voucher", symbol: "PEPAS" },
      { id: "new", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];

    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    expect(within(dialog).queryByRole("button", { name: /Pepas Voucher/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Juan's Voucher/ })).toBeTruthy();
  });
});

describe("PoolVoucherSheet managing", () => {
  beforeEach(() => {
    mocks.membership = { data: true, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("seeds the fields from the stored rate and cap", async () => {
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Exchange rate") as HTMLInputElement).value).toBe("2.5");
    expect((within(dialog).getByLabelText("Credit limit") as HTMLInputElement).value).toBe("500");
    expect(within(dialog).getByText("50.00 PEPAS")).toBeTruthy();
    expect(within(dialog).getByText("125.00 KES")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "The most PEPAS this pool will hold, valued in KES. Room comes back as it's swapped out.",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/Zero accepts no deposits yet/)).toBeNull();
  });

  it("does not present a failed balance read as zero or allow an unknown cap to be saved", async () => {
    mocks.treasury = {
      data: new Map(),
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    };
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("Unavailable")).toHaveLength(2);
    expect(within(dialog).queryByText("0.00 PEPAS")).toBeNull();
    expect(
      (within(dialog).getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Retry" })[0]!);
    expect(mocks.treasury.refetch).toHaveBeenCalledOnce();
  });

  it("re-signs only what the steward changed", async () => {
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "1000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    // No registry call — `add` reverts on a member — and no rate call, because
    // the rate did not move.
    expect(calls.map((call) => call.to)).toEqual([LIMITER]);
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[0]!.data })).toEqual({
      functionName: "setLimitFor",
      args: [TOKEN, POOL, 400000000n],
    });
  });

  it("refuses a submission that would change nothing", async () => {
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("deregisters the voucher once the removal is confirmed", async () => {
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from pool" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([REGISTRY]);
    expect(decodeFunctionData({ abi: tokenIndexRemoveAbi, data: calls[0]!.data })).toEqual({
      functionName: "remove",
      args: [TOKEN],
    });
  });
});

describe("PoolVoucherSheet registration", () => {
  it("stops approval when the selected token became registered", async () => {
    mocks.searchResults = [{ id: "m1", address: CANDIDATE, name: "Plakad", symbol: "PLKD" }];
    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog, "pl");
    mocks.membership = { data: true, isPending: false, isError: false, refetch: vi.fn() };
    fireEvent.click(within(dialog).getByRole("button", { name: /Plakad/ }));

    expect(await within(dialog).findByText("This voucher is already approved.")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();
    expect(
      (within(dialog).getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("waits for the registry before letting an approval be signed", async () => {
    mocks.membership = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    mocks.searchResults = [{ id: "m1", address: CANDIDATE, name: "Plakad", symbol: "PLKD" }];
    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog, "pl");
    fireEvent.click(within(dialog).getByRole("button", { name: /Plakad/ }));
    expect(
      (within(dialog).getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps the selected voucher blocked and retries a failed membership check", async () => {
    const retry = vi.fn();
    mocks.membership = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch: retry,
    };
    mocks.searchResults = [{ id: "m1", address: CANDIDATE, name: "Plakad", symbol: "PLKD" }];
    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog, "pl");
    fireEvent.click(within(dialog).getByRole("button", { name: /Plakad/ }));

    expect(
      within(dialog).getByText("Couldn't check which vouchers are already approved."),
    ).toBeTruthy();
    expect(
      (within(dialog).getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("PoolVoucherSheet on an oracle pool", () => {
  const oraclePool = () => pool({ quoterType: "oracle" });

  beforeEach(() => {
    mocks.quoterKind = { kind: "oracle", isPending: false };
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
  });

  async function pickCandidate() {
    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));
    await within(dialog).findByLabelText("Price feed");
    return dialog;
  }

  it("approves with a verified feed: add, setLimitFor and setOracle in one batch", async () => {
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await pickCandidate();

    // A feed, not a typed rate, and nothing preselected.
    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();
    expect(within(dialog).getByLabelText("Price feed").textContent).toContain(
      "Choose a price feed",
    );
    // No hand-set rate means no unit-of-account value for the holding.
    expect(within(dialog).queryByText("Value in KES")).toBeNull();

    await chooseFeed(dialog, /EUR \/ USD/);
    expect(within(dialog).getByLabelText("Price feed").textContent).toContain("1.1081");
    // The limit is in voucher units.
    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "250" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    expect(decodeFunctionData({ abi: tokenIndexAddAbi, data: calls[0]!.data })).toEqual({
      functionName: "add",
      args: [CANDIDATE],
    });
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[1]!.data })).toEqual({
      functionName: "setLimitFor",
      args: [CANDIDATE, POOL, 250_000_000n],
    });
    expect(
      decodeFunctionData({ abi: oracleQuoterSetOracleWithStalenessAbi, data: calls[2]!.data }),
    ).toEqual({ functionName: "setOracle", args: [CANDIDATE, EUR_FEED, 93_600n] });
  });

  it("asks for a feed before signing", async () => {
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await pickCandidate();

    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));

    expect(
      await within(dialog).findByText("Choose a price feed", { selector: "p, span" }),
    ).toBeTruthy();
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("marks a stale feed on its option", async () => {
    mocks.rounds = {
      data: new Map([[EUR_FEED, { status: "ready" as const, price: "1.1081", stale: true }]]),
      isPending: false,
      fetchStatus: "idle",
    };
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await pickCandidate();

    fireEvent.click(within(dialog).getByLabelText("Price feed"));
    const option = await screen.findByRole("option", { name: /EUR \/ USD/ });
    expect(within(option).getByText("Stale")).toBeTruthy();
  });

  it("sends only the limiter call when the feed is unchanged", async () => {
    onChainFeed(TOKEN, EUR_FEED);
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText("Price feed");

    // Seeded from the chain: the feed by its pair, the cap in voucher units.
    expect(within(dialog).getByLabelText("Price feed").textContent).toContain("EUR / USD");
    expect((within(dialog).getByLabelText("Credit limit") as HTMLInputElement).value).toBe("200");

    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "300" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([LIMITER]);
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[0]!.data })).toEqual({
      functionName: "setLimitFor",
      args: [TOKEN, POOL, 300_000_000n],
    });
  });

  it("refuses a submission that changes neither feed nor limit", async () => {
    onChainFeed(TOKEN, EUR_FEED);
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText("Price feed");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Nothing has changed."));
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("does not write back a feed the chain replaced after the form opened", async () => {
    // A cached mapping seeds the form while the chain read refreshes behind it.
    // By the time the steward saves, someone else has moved the voucher to
    // another feed; a limit-only save must not restore the cached one.
    mocks.realOracleRead = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = poolQuoterQueryKeys.oracles(QUOTER, [TOKEN.toLowerCase()]);
    client.setQueryData(
      key,
      new Map([[TOKEN.toLowerCase(), { ...noFeed, aggregatorAddress: EUR_FEED }]]),
      { updatedAt: 0 },
    );
    let answer: (value: unknown) => void = () => {};
    mocks.multicall.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
      client,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText("Price feed");
    expect(within(dialog).getByLabelText("Price feed").textContent).toContain("EUR / USD");
    expect(mocks.multicall).toHaveBeenCalledTimes(1);
    // Editing starts while the read is still out, so the form keeps its values.
    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "300" } });

    answer([
      { status: "success", result: 86_400n },
      { status: "success", result: UNREGISTERED_FEED },
      { status: "success", result: 0n },
    ]);
    await waitFor(() =>
      expect(
        (client.getQueryData(key) as Map<string, PoolVoucherOracle>).get(TOKEN.toLowerCase())
          ?.aggregatorAddress,
      ).toBe(UNREGISTERED_FEED),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    expect(relayedCalls().map((call) => call.to)).toEqual([LIMITER]);
  });

  it("marks the current feed stale by the bound its mapping has, not the registry's", async () => {
    // The voucher's mapping carries 3600s; the registry recommends 93600s for
    // the same feed. Until the feed is re-sent, the quoter enforces 3600s.
    onChainFeed(TOKEN, EUR_FEED, 3_600n);
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText("Price feed");

    expect(mocks.roundFeeds).toHaveBeenLastCalledWith([
      { address: EUR_FEED, maxStalenessSeconds: 3_600 },
    ]);
  });

  it("marks a feed that is not yet set by the bound it will be sent with", async () => {
    mocks.listFeeds.mockResolvedValue([
      EUR,
      { ...EUR, id: "8", name: "USD", address: UNREGISTERED_FEED, maxStalenessSeconds: null },
    ]);
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );
    await pickCandidate();

    // The registry's bound for EUR; the quoter's global bound for a feed sent without one.
    expect(mocks.roundFeeds).toHaveBeenLastCalledWith([
      { address: EUR_FEED, maxStalenessSeconds: 93_600 },
      { address: UNREGISTERED_FEED, maxStalenessSeconds: 86_400 },
    ]);
  });

  it("shows an unregistered current feed as unverified, and replaces it", async () => {
    onChainFeed(TOKEN, UNREGISTERED_FEED);
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText("Price feed");

    expect(within(dialog).getByLabelText("Price feed").textContent).toContain("Custom address");
    expect((within(dialog).getByLabelText("Feed address") as HTMLInputElement).value).toBe(
      UNREGISTERED_FEED,
    );
    expect(within(dialog).getByText("Unverified")).toBeTruthy();

    await chooseFeed(dialog, /EUR \/ USD/);
    expect(within(dialog).queryByText("Unverified")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([QUOTER]);
    expect(
      decodeFunctionData({ abi: oracleQuoterSetOracleWithStalenessAbi, data: calls[0]!.data }),
    ).toEqual({ functionName: "setOracle", args: [TOKEN, EUR_FEED, 93_600n] });
  });

  it("takes a custom address on an empty registry, under the quoter's global bound", async () => {
    mocks.listFeeds.mockResolvedValue([]);
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await pickCandidate();

    expect(within(dialog).getByText("No verified price feeds")).toBeTruthy();
    await chooseFeed(dialog, "Custom address");
    fireEvent.change(within(dialog).getByLabelText("Feed address"), {
      target: { value: UNREGISTERED_FEED.toLowerCase() },
    });
    expect(within(dialog).getByText("Unverified")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    expect(decodeFunctionData({ abi: oracleQuoterSetOracleAbi, data: calls[2]!.data })).toEqual({
      functionName: "setOracle",
      args: [CANDIDATE, UNREGISTERED_FEED],
    });
  });

  it("holds the form while the feed list is pending", async () => {
    mocks.listFeeds.mockReturnValue(new Promise(() => {}));
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    expect(await within(dialog).findByText("Loading price feeds…")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Price feed")).toBeNull();
    expect(
      (within(dialog).getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("blocks on a failed feed list and recovers on Retry", async () => {
    mocks.listFeeds.mockRejectedValueOnce(new Error("offline"));
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    expect(await within(dialog).findByText("Couldn't load price feeds.")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Price feed")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));

    expect(await within(dialog).findByLabelText("Price feed")).toBeTruthy();
    expect(mocks.listFeeds).toHaveBeenCalledTimes(2);
  });

  it("keeps the retained list when a refetch fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[]}
        voucher={null}
        open
        onClose={vi.fn()}
      />,
      client,
    );
    const dialog = await pickCandidate();
    await chooseFeed(dialog, /EUR \/ USD/);

    mocks.listFeeds.mockRejectedValueOnce(new Error("offline"));
    await client.refetchQueries({ queryKey: oracleFeedKeys.all });
    await waitFor(() =>
      expect(client.getQueryState(oracleFeedKeys.list(CHAIN_ID))?.status).toBe("error"),
    );

    // The steward's choice survives; the failure does not block a list already read.
    expect(within(dialog).queryByText("Couldn't load price feeds.")).toBeNull();
    expect(within(dialog).getByLabelText("Price feed").textContent).toContain("EUR / USD");
    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
  });

  it("blocks when the voucher's current feed cannot be read", async () => {
    mocks.oracles = { ...mocks.oracles, data: undefined, isError: true };
    renderSheet(
      <PoolVoucherSheet
        pool={oraclePool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        open
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");

    expect(
      await within(dialog).findByText(
        "Couldn't read this voucher's current price feed, so it can't be changed right now.",
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(mocks.oracles.refetch).toHaveBeenCalled();
  });
});
