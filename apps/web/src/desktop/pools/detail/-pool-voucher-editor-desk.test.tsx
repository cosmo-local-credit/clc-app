import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { decodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import type { OracleFeed } from "@clc/api/features/oracle-feeds/client";
import {
  limiterSetLimitForAbi,
  oracleQuoterSetOracleWithStalenessAbi,
  relativeQuoterSetPriceIndexValueAbi,
  tokenIndexAddAbi,
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
    data: new Map<
      string,
      { aggregatorAddress: `0x${string}` | null; maxStalenessSeconds: bigint }
    >() as
      | Map<string, { aggregatorAddress: `0x${string}` | null; maxStalenessSeconds: bigint }>
      | undefined,
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
vi.mock("#/features/pools/hooks/use-pool-quoter", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePoolQuoterKind: () => mocks.quoterKind,
  usePoolVoucherRatesByAddress: () => mocks.rates,
  usePoolVoucherOracles: () => mocks.oracles,
  useOracleFeedRounds: () => mocks.rounds,
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

import { PoolVoucherEditorSide } from "./pool-voucher-editor-desk";

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
async function chooseFeed(name: string | RegExp) {
  fireEvent.click(screen.getByLabelText("Price feed"));
  const option = await screen.findByRole("option", { name });
  fireEvent.pointerDown(option, { pointerType: "touch" });
  fireEvent.click(option);
}

function onChainFeed(token: string, aggregatorAddress: `0x${string}` | null) {
  mocks.oracles.data?.set(token.toLowerCase(), { aggregatorAddress, maxStalenessSeconds: 0n });
}

/** Search results stay hidden until the field has a real term. */
function searchVouchers(term = "ju") {
  fireEvent.change(screen.getByLabelText("Search vouchers"), { target: { value: term } });
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
      [TOKEN.toLowerCase(), { aggregatorAddress: null, maxStalenessSeconds: 0n }],
      [CANDIDATE.toLowerCase(), { aggregatorAddress: null, maxStalenessSeconds: 0n }],
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

function renderSide(voucher: PoolVoucher | null, poolOverrides: Partial<UserPool> = {}) {
  return renderSheet(
    <PoolVoucherEditorSide
      pool={pool(poolOverrides)}
      poolVouchers={voucher ? [voucher] : []}
      voucher={voucher}
      onClose={vi.fn()}
    />,
  );
}

describe("PoolVoucherEditorSide on a relative pool", () => {
  beforeEach(() => {
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
  });

  it("registers, caps and prices a searched voucher in one batch", async () => {
    renderSide(null);

    searchVouchers();
    fireEvent.click(screen.getByRole("button", { name: /Juan's Voucher/ }));
    fireEvent.change(screen.getByLabelText("Exchange rate"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Credit limit"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve voucher" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    expect(decodeFunctionData({ abi: tokenIndexAddAbi, data: calls[0]!.data }).args).toEqual([
      CANDIDATE,
    ]);
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[1]!.data }).args).toEqual([
      CANDIDATE,
      POOL,
      200_000_000n,
    ]);
    expect(
      decodeFunctionData({ abi: relativeQuoterSetPriceIndexValueAbi, data: calls[2]!.data }).args,
    ).toEqual([CANDIDATE, 2_500_000n]);
  });

  it("refuses a quoter it cannot configure", async () => {
    mocks.quoterKind = { kind: "decimal", isPending: false };
    renderSide(null, { quoterType: "decimal" });

    searchVouchers();
    fireEvent.click(screen.getByRole("button", { name: /Juan's Voucher/ }));

    expect(screen.queryByLabelText("Exchange rate")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("PoolVoucherEditorSide on an oracle pool", () => {
  beforeEach(() => {
    mocks.quoterKind = { kind: "oracle", isPending: false };
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
  });

  it("approves with a verified feed: add, setLimitFor and setOracle in one batch", async () => {
    renderSide(null, { quoterType: "oracle" });

    searchVouchers();
    fireEvent.click(screen.getByRole("button", { name: /Juan's Voucher/ }));
    await screen.findByLabelText("Price feed");
    expect(screen.queryByLabelText("Exchange rate")).toBeNull();

    await chooseFeed(/EUR \/ USD/);
    fireEvent.change(screen.getByLabelText("Credit limit"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve voucher" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([REGISTRY, LIMITER, QUOTER]);
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[1]!.data }).args).toEqual([
      CANDIDATE,
      POOL,
      250_000_000n,
    ]);
    expect(
      decodeFunctionData({ abi: oracleQuoterSetOracleWithStalenessAbi, data: calls[2]!.data }).args,
    ).toEqual([CANDIDATE, EUR_FEED, 93_600n]);
  });

  it("shows an unregistered current feed as unverified and replaces only the feed", async () => {
    onChainFeed(TOKEN, UNREGISTERED_FEED);
    renderSide(poolVoucher(), { quoterType: "oracle" });

    await screen.findByLabelText("Price feed");
    expect((screen.getByLabelText("Feed address") as HTMLInputElement).value).toBe(
      UNREGISTERED_FEED,
    );
    expect(screen.getByText("Unverified")).toBeTruthy();

    await chooseFeed(/EUR \/ USD/);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([QUOTER]);
    expect(
      decodeFunctionData({ abi: oracleQuoterSetOracleWithStalenessAbi, data: calls[0]!.data }).args,
    ).toEqual([TOKEN, EUR_FEED, 93_600n]);
  });

  it("blocks on a failed feed list and recovers on Retry", async () => {
    mocks.listFeeds.mockRejectedValueOnce(new Error("offline"));
    renderSide(poolVoucher(), { quoterType: "oracle" });

    expect(await screen.findByText("Couldn't load price feeds.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Price feed")).toBeTruthy();
  });
});
