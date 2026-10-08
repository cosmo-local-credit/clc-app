import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { decodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import {
  limiterSetLimitForAbi,
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

const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  quoterKind: { kind: "relative", isPending: false } as {
    kind: string;
    isPending: boolean;
  },
  searchResults: [] as { id: string; address: string; name: string; symbol: string }[],
  getFilteredMarketVouchers: vi.fn(),
  getAccountTokens: vi.fn(),
  membership: { data: false as boolean | undefined, isPending: false },
  rates: {
    data: new Map<string, bigint>(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
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

vi.mock("#/features/pools/hooks/use-pool-admin", () => ({
  usePoolAdminRelay: () => ({ mutateAsync: mocks.relay, isPending: false }),
}));

vi.mock("#/features/pools/hooks/use-pool-quoter", () => ({
  usePoolQuoterKind: () => mocks.quoterKind,
  usePoolVoucherRatesByAddress: () => mocks.rates,
}));

vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: () => mocks.treasury,
}));

vi.mock("#/features/pools/hooks/use-pool-registry", () => ({
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

vi.mock("#/lib/api/market", () => ({
  marketClient: { getFilteredMarketVouchers: mocks.getFilteredMarketVouchers },
}));

vi.mock("#/lib/api/accounts", () => ({
  accountsClient: { getAccountTokens: mocks.getAccountTokens },
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: { decimals: 6 }, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("#/components/wallet", () => ({
  SignHint: () => <p>Sign hint</p>,
}));

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

function renderSheet(node: ReactNode) {
  return render(<>{node}</>);
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
  mocks.membership = { data: false, isPending: false };
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
  mocks.searchResults = [];
  mocks.getFilteredMarketVouchers.mockReset();
  mocks.getAccountTokens.mockReset();
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
    mocks.quoterKind = { kind: "oracle", isPending: false };
    mocks.searchResults = [
      { id: "m1", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
    renderSheet(
      <PoolVoucherSheet
        pool={pool({ quoterType: "oracle" })}
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

  it("uses pool rows without personal requests before search and excludes them from results", async () => {
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
    const poolGroup = within(within(dialog).getByRole("region", { name: "In this pool" }));
    expect(poolGroup.getByRole("button", { name: /Pepas Voucher/ })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Juan's Voucher/ })).toBeNull();
    expect(mocks.getFilteredMarketVouchers).not.toHaveBeenCalled();
    expect(mocks.getAccountTokens).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("alert")).toBeNull();

    searchVouchers(dialog);
    expect(within(dialog).queryByRole("button", { name: /Pepas Voucher/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Juan's Voucher/ })).toBeTruthy();

    searchVouchers(dialog, "");
    expect(within(dialog).getByRole("button", { name: /Pepas Voucher/ })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Juan's Voucher/ })).toBeNull();
    expect(mocks.getFilteredMarketVouchers).not.toHaveBeenCalled();
    expect(mocks.getAccountTokens).not.toHaveBeenCalled();
  });
});

describe("PoolVoucherSheet managing", () => {
  beforeEach(() => {
    mocks.membership = { data: true, isPending: false };
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
        "How much value in KES can be swapped from the pool using PEPAS vouchers?",
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
  it("omits add for a token the registry already holds", async () => {
    // The catalog can miss a member — one seeded when the pool was published, or
    // one the indexer has not projected — so the picker will offer it. Sending
    // `add` anyway reverts TokenAlreadyExists and, with revertOnFailure, takes
    // the rate and the limit down with it.
    mocks.membership = { data: true, isPending: false };
    mocks.searchResults = [{ id: "m1", address: CANDIDATE, name: "Plakad", symbol: "PLKD" }];
    renderSheet(
      <PoolVoucherSheet pool={pool()} poolVouchers={[]} voucher={null} open onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole("dialog");
    searchVouchers(dialog, "pl");
    fireEvent.click(within(dialog).getByRole("button", { name: /Plakad/ }));
    expect(within(dialog).getByText(/already allows PLKD/)).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Exchange rate"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Credit limit"), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));

    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(calls.map((call) => call.to)).toEqual([LIMITER, QUOTER]);
  });

  it("waits for the registry before letting an approval be signed", async () => {
    mocks.membership = { data: undefined, isPending: true };
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
});
