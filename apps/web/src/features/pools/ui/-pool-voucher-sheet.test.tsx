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
  membership: { data: false as boolean | undefined, isPending: false },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("#/features/pools/hooks/use-pool-admin", () => ({
  usePoolAdminRelay: () => ({ mutateAsync: mocks.relay, isPending: false }),
}));

vi.mock("#/features/pools/hooks/use-pool-quoter", () => ({
  usePoolQuoterKind: () => mocks.quoterKind,
  usePoolVoucherRates: () => ({ data: undefined }),
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

beforeEach(() => {
  mocks.relay.mockReset();
  mocks.relay.mockResolvedValue({ trackingId: "t1", txHash: `0x${"ab".repeat(32)}` });
  mocks.quoterKind = { kind: "relative", isPending: false };
  mocks.membership = { data: false, isPending: false };
  mocks.searchResults = [];
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
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[]}
        voucher={null}
        currentRatePpm={undefined}
        rateIsPending={false}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
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
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[]}
        voucher={null}
        currentRatePpm={undefined}
        rateIsPending={false}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    expect((within(dialog).getByLabelText("Exchange rate") as HTMLInputElement).value).toBe("1");
    expect((within(dialog).getByLabelText("Credit limit") as HTMLInputElement).value).toBe("0");

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
        currentRatePpm={undefined}
        rateIsPending={false}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Juan's Voucher/ }));

    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();
    expect(
      (within(dialog).getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps vouchers the pool already holds out of the picker", async () => {
    mocks.searchResults = [
      { id: "m1", address: TOKEN, name: "Pepas Voucher", symbol: "PEPAS" },
      { id: "m2", address: CANDIDATE, name: "Juan's Voucher", symbol: "JUAN" },
    ];
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={null}
        currentRatePpm={undefined}
        rateIsPending={false}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /Pepas Voucher/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /Juan's Voucher/ })).toBeTruthy();
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
        currentRatePpm={2_500_000n}
        rateIsPending={false}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Exchange rate") as HTMLInputElement).value).toBe("2.5");
    expect((within(dialog).getByLabelText("Credit limit") as HTMLInputElement).value).toBe("500");
    expect(
      within(dialog).getByText(
        "How much value in KES can be swapped from the pool using PEPAS vouchers?",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/Zero accepts no deposits yet/)).toBeNull();
  });

  it("re-signs only what the steward changed", async () => {
    renderSheet(
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[poolVoucher()]}
        voucher={poolVoucher()}
        currentRatePpm={2_500_000n}
        rateIsPending={false}
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
        currentRatePpm={2_500_000n}
        rateIsPending={false}
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
        currentRatePpm={2_500_000n}
        rateIsPending={false}
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
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[]}
        voucher={null}
        currentRatePpm={undefined}
        rateIsPending={false}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
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
      <PoolVoucherSheet
        pool={pool()}
        poolVouchers={[]}
        voucher={null}
        currentRatePpm={undefined}
        rateIsPending={false}
        open
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Plakad/ }));
    expect(
      (within(dialog).getByRole("button", { name: "Approve voucher" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
