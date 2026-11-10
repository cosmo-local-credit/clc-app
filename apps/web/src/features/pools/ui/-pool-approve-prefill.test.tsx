import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { decodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { limiterSetLimitForAbi, tokenIndexAddAbi } from "@clc/core/features/pool-admin/logic";

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
  detail: vi.fn(),
  detailRefetch: vi.fn(),
}));

vi.mock("#/features/pools/hooks/use-pool-admin", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
  useMarketVoucherDetail: (address: string | undefined) => mocks.detail(address),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { BackendApiError } from "@clc/api/client/errors";

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
  return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

/** Search results stay hidden until the field has a real term. */
function searchVouchers(dialog: HTMLElement, term = "ju") {
  fireEvent.change(within(dialog).getByLabelText("Search vouchers"), {
    target: { value: term },
  });
}

/** The catalog's answer for one address: found, or not yet known. */
function catalogKnows(found: Record<string, { name: string; symbol: string; decimals: number }>) {
  mocks.detail.mockImplementation((address: string | undefined) => {
    const row = address ? found[address] : undefined;
    return row
      ? {
          data: { address, ...row },
          isPending: false,
          isError: false,
          isFetching: false,
          refetch: mocks.detailRefetch,
        }
      : {
          data: undefined,
          isPending: !address,
          isError: false,
          isFetching: false,
          refetch: mocks.detailRefetch,
        };
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
  mocks.searchResults = [];
  mocks.suggestions = {
    issued: { rows: [], status: "ready", completeness: "complete", retry: vi.fn() },
    holdings: { rows: [], status: "ready", completeness: "complete", retry: vi.fn() },
    deposited: { rows: [], status: "ready", completeness: "complete", retry: vi.fn() },
  };
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  catalogKnows({ [CANDIDATE]: { name: "Juan's Voucher", symbol: "JUAN", decimals: 6 } });
});

afterEach(() => {
  vi.clearAllMocks();
});

/** What `tool=approve&candidate=…&exchangeRate=…&creditLimit=…` hands the sheet. */
const SEED = { candidate: CANDIDATE, exchangeRate: "2.5", creditLimit: "500" } as const;

function approveSheet(
  approveSeed: { candidate: `0x${string}`; exchangeRate?: string; creditLimit?: string } | null,
  poolVouchers: PoolVoucher[] = [],
) {
  return (
    <PoolVoucherSheet
      pool={pool()}
      poolVouchers={poolVouchers}
      voucher={null}
      approveSeed={approveSeed}
      open
      onClose={vi.fn()}
    />
  );
}

const field = (dialog: HTMLElement, label: string) =>
  within(dialog).getByLabelText(label) as HTMLInputElement;

describe("PoolVoucherSheet from a steward-approve link", () => {
  it("resolves the candidate to its name, symbol and decimals and seeds the rate and limit", async () => {
    renderSheet(approveSheet(SEED));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("1 JUAN")).toBeTruthy();
    expect(field(dialog, "Exchange rate").value).toBe("2.5");
    expect(field(dialog, "Credit limit").value).toBe("500");

    fireEvent.click(within(dialog).getByRole("button", { name: "Approve voucher" }));
    await waitFor(() => expect(mocks.relay).toHaveBeenCalledTimes(1));
    const calls = relayedCalls();
    expect(decodeFunctionData({ abi: tokenIndexAddAbi, data: calls[0]!.data }).args).toEqual([
      CANDIDATE,
    ]);
    expect(decodeFunctionData({ abi: limiterSetLimitForAbi, data: calls[1]!.data }).args).toEqual([
      CANDIDATE,
      POOL,
      200000000n,
    ]);
  });

  it("opens the empty picker and drops the seeds when the catalog does not know the address", async () => {
    mocks.detail.mockImplementation(() => ({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      error: new BackendApiError(404, "not found", "E04"),
      refetch: mocks.detailRefetch,
    }));
    renderSheet(approveSheet(SEED));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Couldn't find that voucher")).toBeTruthy();
    expect(within(dialog).getByLabelText("Search vouchers")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();
  });

  it("offers a retry for a failed read and keeps the seeds", async () => {
    let failing = true;
    mocks.detail.mockImplementation((address: string | undefined) =>
      failing
        ? {
            data: undefined,
            isPending: false,
            isError: true,
            isFetching: false,
            error: new BackendApiError(503, "down", undefined, { kind: "server" }),
            refetch: mocks.detailRefetch,
          }
        : {
            data: { address, name: "Juan's Voucher", symbol: "JUAN", decimals: 6 },
            isPending: false,
            isError: false,
            isFetching: false,
            refetch: mocks.detailRefetch,
          },
    );
    const view = renderSheet(approveSheet(SEED));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Couldn't load that voucher.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(mocks.detailRefetch).toHaveBeenCalled();

    failing = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>{approveSheet(SEED)}</QueryClientProvider>,
    );
    expect(await within(await screen.findByRole("dialog")).findByText("1 JUAN")).toBeTruthy();
    expect(field(screen.getByRole("dialog"), "Exchange rate").value).toBe("2.5");
  });

  it("shows the already-approved block for a voucher in the pool's catalog, and seeds nothing", async () => {
    renderSheet(approveSheet(SEED, [poolVoucher({ tokenAddress: CANDIDATE, id: "v2" })]));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("This voucher is already approved.")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();
  });

  it("shows the block for a registry member too", async () => {
    mocks.membership = { data: true, isPending: false, isError: false, refetch: vi.fn() };
    renderSheet(approveSheet(SEED));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("This voucher is already approved.")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();
  });

  it("waits for every chain read before the seeds apply, and never lifts a block", async () => {
    mocks.rates = { ...mocks.rates, isPending: true, data: new Map() };
    const view = renderSheet(approveSheet(SEED));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Reading the current rate…")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Exchange rate")).toBeNull();

    mocks.rates = {
      ...mocks.rates,
      isPending: false,
      data: new Map([[CANDIDATE.toLowerCase(), 1_000_000n]]),
    };
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>{approveSheet(SEED)}</QueryClientProvider>,
    );
    expect(field(await screen.findByRole("dialog"), "Exchange rate").value).toBe("2.5");
  });

  it("keeps the chain value for an invalid seed", async () => {
    renderSheet(approveSheet({ candidate: CANDIDATE, exchangeRate: "-1", creditLimit: "500" }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("1 JUAN");
    expect(field(dialog, "Exchange rate").value).toBe("1");
    expect(field(dialog, "Credit limit").value).toBe("500");
  });

  it("drops the seeds when the steward picks a different voucher", async () => {
    const OTHER = "0x4433000000000000000000000000000000000707";
    catalogKnows({
      [CANDIDATE]: { name: "Juan's Voucher", symbol: "JUAN", decimals: 6 },
      [OTHER]: { name: "Other Voucher", symbol: "OTHR", decimals: 6 },
    });
    mocks.rates.data.set(OTHER.toLowerCase(), 1_000_000n);
    mocks.treasury.data.set(OTHER.toLowerCase(), {
      balanceRaw: "0",
      feesRaw: "0",
      withdrawableRaw: "0",
      limitRaw: "0",
    });
    mocks.searchResults = [{ id: "m2", address: OTHER, name: "Other Voucher", symbol: "OTHR" }];
    renderSheet(approveSheet(SEED));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("1 JUAN");
    fireEvent.click(within(dialog).getByRole("button", { name: /Change/ }));
    searchVouchers(dialog, "ot");
    fireEvent.click(within(dialog).getByRole("button", { name: /Other Voucher/ }));

    expect(await within(dialog).findByText("1 OTHR")).toBeTruthy();
    expect(field(dialog, "Exchange rate").value).toBe("1");
    expect(field(dialog, "Credit limit").value).toBe("0");
  });
});
