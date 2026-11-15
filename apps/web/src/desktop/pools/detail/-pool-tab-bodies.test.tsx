import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolActivityFeed } from "#/desktop/pools/pool-activity-feed";
import type { PoolActivityEntry } from "#/features/pools/logic/pool-activity";

const mocks = vi.hoisted(() => ({
  holdings: vi.fn(),
  holdingGroups: vi.fn(),
  offerings: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    to,
    params,
    search,
    "aria-label": label,
  }: {
    children: ReactNode;
    className?: string;
    to: string;
    params?: { voucherAddress?: string; poolAddress?: string };
    search?: Record<string, string>;
    "aria-label"?: string;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    const query = search ? new URLSearchParams(search).toString() : "";
    return (
      <a href={query ? `${path}?${query}` : path} className={className} aria-label={label}>
        {children}
      </a>
    );
  },
}));
vi.mock("#/features/pools/hooks/use-pool-holdings", () => ({
  usePoolHoldings: (...args: unknown[]) => mocks.holdings(...args),
}));
vi.mock("#/features/pools/hooks/use-pool-holding-groups", () => ({
  usePoolHoldingGroups: (...args: unknown[]) => mocks.holdingGroups(...args),
}));
vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  usePoolOfferingsInfinite: (...args: unknown[]) => mocks.offerings(...args),
}));
import { PoolActivityTable, PoolHoldingsTable, PoolOfferingsGrid } from "./pool-tab-bodies";

const POOL = "0x5c4e18f7329bb8b533e5be0d8b176ee1ed735aaa";
const PARTY = "0x1111e18f7329bb8b533e5be0d8b176ee1ed71111";

const leg = (symbol: string, amount = "1000") => ({
  tokenAddress: "0x9d1e18f7329bb8b533e5be0d8b176ee1ed73bbbb",
  tokenSymbol: symbol,
  tokenName: `${symbol} Voucher`,
  tokenDecimals: 2,
  amount,
});

const base = {
  txHash: "0xabc",
  dateBlock: "2026-10-01T10:00:00Z",
  success: true,
  detail: {} as PoolActivityEntry["detail"],
};

function feed(entries: PoolActivityEntry[]): PoolActivityFeed {
  return {
    entries,
    query: {
      isPending: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    },
  } as unknown as PoolActivityFeed;
}

function mountActivity(
  entries: PoolActivityEntry[],
  types: readonly string[] = [],
  onTypesChange = vi.fn(),
) {
  render(
    <PoolActivityTable
      feed={feed(entries)}
      selectedKey={undefined}
      onOpen={vi.fn()}
      types={types as never}
      onTypesChange={onTypesChange}
    />,
  );
  return onTypesChange;
}

beforeEach(() => {
  mocks.holdings.mockReset().mockReturnValue({ holdings: [], unit: "KES", isPending: false });
  mocks.holdingGroups.mockReset().mockReturnValue({
    accepted: [],
    pending: [],
    unit: "KES",
    feeds: null,
    verified: true,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  mocks.offerings.mockReset().mockReturnValue({
    data: { pages: [{ offerings: [] }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
  });
});

describe("pool activity types", () => {
  const filters = () => screen.getByRole("group", { name: "Filters" });

  it("offers the phone's kinds, with All on while none is chosen", () => {
    mountActivity([]);
    expect(
      within(filters())
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["All", "Creation", "Sent", "Received", "Swapped", "Deposits", "Pay Out"]);
    expect(
      within(filters()).getByRole("button", { name: "All" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("adds and removes a kind in the phone's order, and All clears them", () => {
    const change = mountActivity([], ["pool_payout"]);
    fireEvent.click(within(filters()).getByRole("button", { name: "Swapped" }));
    expect(change).toHaveBeenLastCalledWith(["swapped", "pool_payout"]);
    fireEvent.click(within(filters()).getByRole("button", { name: "Pay Out" }));
    expect(change).toHaveBeenLastCalledWith([]);
    fireEvent.click(within(filters()).getByRole("button", { name: "All" }));
    expect(change).toHaveBeenLastCalledWith([]);
  });

  it("says when nothing matches the filter", () => {
    mountActivity([], ["swapped"]);
    expect(screen.getByText("No activity matches these filters.")).toBeTruthy();
  });

  it("says nothing has moved when no filter is set", () => {
    mountActivity([]);
    expect(screen.getByText("Nothing has moved through this pool yet.")).toBeTruthy();
  });
});

describe("pool activity rows", () => {
  it("marks a failed row, names a payout as the phone does, and shows a swap's protocol fee", () => {
    mountActivity([
      {
        ...base,
        key: "failed",
        success: false,
        kind: "transfer",
        direction: "IN",
        counterpartyAddress: PARTY,
        leg: leg("KFP"),
      },
      {
        ...base,
        key: "payout",
        kind: "payout",
        direction: "OUT",
        counterpartyAddress: PARTY,
        leg: leg("KFP"),
      },
      {
        ...base,
        key: "swap",
        kind: "swap",
        counterpartyAddress: PARTY,
        received: leg("KFP"),
        sent: leg("USDC"),
        protocolFee: leg("USDC", "5"),
      },
    ]);
    const rows = screen
      .getAllByRole("button")
      .filter((row) => row.hasAttribute("data-desktop-row"));
    expect(within(rows[0]!).getByText("Failed")).toBeTruthy();
    expect(within(rows[1]!).getByText("Pay Out")).toBeTruthy();
    expect(within(rows[1]!).queryByText("Failed")).toBeNull();
    expect(within(rows[2]!).getByText(/^Protocol fee/)).toBeTruthy();
  });
});

describe("pool holdings table", () => {
  const pool = {
    address: POOL,
    name: "Kilifi Traders",
    active: true,
  } as unknown as UserPool;
  const voucher = {
    id: "1",
    name: "Kilifi Fish",
    symbol: "KFP",
    tokenAddress: PARTY,
    active: true,
  } as unknown as PoolVoucher;
  const acceptedHolding = {
    tokenAddress: PARTY.toLowerCase(),
    name: "Kilifi Fish",
    symbol: "KFP",
    decimals: 2,
    iconUrl: null,
    balanceRaw: "1200",
    liquidityRaw: "1200",
    unitValueRaw: "14400000",
    percentOfLargest: 100,
    ratePpm: "1200000",
    cap: { kind: "uncapped" },
    fillPercent: null,
    headroomRaw: null,
    capUnitValueRaw: null,
    headroomUnitValueRaw: null,
    feesRaw: "0",
    priced: true,
    uncatalogued: false,
  };
  const pendingAddress = "0x2222222222222222222222222222222222222222";
  const pendingHolding = {
    ...acceptedHolding,
    tokenAddress: pendingAddress,
    name: "Waiting Voucher",
    symbol: "WAIT",
    balanceRaw: "500",
    liquidityRaw: "500",
    unitValueRaw: null,
    percentOfLargest: null,
    ratePpm: null,
    priced: false,
    uncatalogued: true,
  };

  it("separates accepted rows from pending deposits and exposes owner actions", () => {
    const approve = vi.fn();
    const manage = vi.fn();
    mocks.holdingGroups.mockReturnValue({
      accepted: [{ holding: acceptedHolding, voucher }],
      pending: [pendingHolding],
      unit: "KES",
      feeds: null,
      verified: true,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(
      <PoolHoldingsTable
        pool={pool}
        catalog={{
          vouchers: [voucher],
          isPending: false,
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        }}
        onManage={manage}
        onApprove={approve}
      />,
    );

    expect(screen.getByText("Kilifi Fish")).toBeTruthy();
    expect(screen.getByText("1.20")).toBeTruthy();
    expect(screen.getByText("Waiting Voucher")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Pending approval")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Swap for KFP" }).getAttribute("href")).toBe(
      `/pools/${POOL}/swap?receive=${PARTY.toLowerCase()}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Manage KFP" }));
    expect(manage).toHaveBeenCalledWith(voucher);
    fireEvent.click(screen.getByRole("button", { name: "Approve WAIT" }));
    expect(approve).toHaveBeenCalledWith(pendingAddress);
  });

  it("does not classify holdings after an initial membership failure", () => {
    mocks.holdingGroups.mockReturnValue({
      accepted: [],
      pending: [pendingHolding],
      unit: "KES",
      feeds: null,
      verified: false,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(
      <PoolHoldingsTable
        pool={pool}
        catalog={{
          vouchers: [],
          isPending: false,
          isError: true,
          isFetching: false,
          refetch: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("Couldn't verify all Pool holdings.")).toBeTruthy();
    expect(screen.queryByText("Waiting Voucher")).toBeNull();
  });
});

describe("pool offering details", () => {
  it("opens a desktop dialog with voucher and prefilled Swap actions", () => {
    mocks.offerings.mockReturnValue({
      data: {
        pages: [
          {
            offerings: [
              {
                id: "offer-1",
                voucherAddress: PARTY,
                voucherName: "Kilifi Fish",
                voucherSymbol: "KFP",
                name: "Fresh fish",
                description: "Caught this morning",
                pricePerUnit: "2",
                priceInUnitOfAccount: null,
                voucherUoa: null,
                unitLabel: "kg",
                imageUrl: null,
                voucherImageUrl: null,
                tags: [],
              },
            ],
          },
        ],
      },
      isPending: false,
      isError: false,
      hasNextPage: false,
    });

    render(<PoolOfferingsGrid poolAddress={POOL} vouchers={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "View offering details: Fresh fish" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Caught this morning")).toBeTruthy();
    expect(
      within(dialog).getByRole("link", { name: "Open voucher page" }).getAttribute("href"),
    ).toBe(`/vouchers/${PARTY}?poolAddress=${POOL}&tab=offerings`);
    expect(within(dialog).getByRole("link", { name: "Swap" }).getAttribute("href")).toBe(
      `/pools/${POOL}/swap?receive=${PARTY.toLowerCase()}`,
    );
  });
});
