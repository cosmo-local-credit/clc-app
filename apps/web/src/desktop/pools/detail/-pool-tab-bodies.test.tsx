import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolActivityFeed } from "#/desktop/pools/pool-activity-feed";
import type { PoolActivityEntry } from "#/features/pools/logic/pool-activity";

const mocks = vi.hoisted(() => ({ holdings: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    to,
    params,
    "aria-label": label,
  }: {
    children: ReactNode;
    className?: string;
    to: string;
    params?: { voucherAddress?: string };
    "aria-label"?: string;
  }) => (
    <a
      href={params?.voucherAddress ? `/vouchers/${params.voucherAddress}` : to}
      className={className}
      aria-label={label}
    >
      {children}
    </a>
  ),
}));
vi.mock("#/features/pools/hooks/use-pool-holdings", () => ({
  usePoolHoldings: (...args: unknown[]) => mocks.holdings(...args),
}));
vi.mock("#/features/pools/hooks/use-pool-voucher-tokens", () => ({
  usePoolVoucherTokens: (vouchers: unknown[]) => vouchers.map(() => undefined),
}));

import { PoolActivityTable, PoolVouchersTable } from "./pool-tab-bodies";

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

describe("pool vouchers table", () => {
  const pool = { address: POOL, name: "Kilifi Traders" } as unknown as UserPool;
  const vouchers = [
    { id: "1", name: "Kilifi Fish", symbol: "KFP", tokenAddress: PARTY, active: true },
  ] as unknown as PoolVoucher[];

  it("lists a guest the vouchers without the pool's holdings or limits", () => {
    render(
      <PoolVouchersTable
        pool={pool}
        figures={false}
        poolVouchers={vouchers}
        vouchers={vouchers}
        selectedKey={undefined}
      />,
    );
    expect(screen.getByText("Kilifi Fish")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /In pool/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Limit/ })).toBeNull();
    expect(mocks.holdings).not.toHaveBeenCalled();
  });

  it("opens each voucher's own page, as the phone's row does", () => {
    render(
      <PoolVouchersTable
        pool={pool}
        figures={false}
        poolVouchers={vouchers}
        vouchers={vouchers}
        selectedKey={undefined}
      />,
    );
    expect(screen.getByRole("link", { name: "Open voucher page" }).getAttribute("href")).toBe(
      `/vouchers/${PARTY.toLowerCase()}`,
    );
  });

  it("adds the figures once signed in", () => {
    render(
      <PoolVouchersTable
        pool={pool}
        figures
        poolVouchers={vouchers}
        vouchers={vouchers}
        selectedKey={undefined}
      />,
    );
    expect(screen.getByRole("columnheader", { name: /In pool/ })).toBeTruthy();
    expect(mocks.holdings).toHaveBeenCalled();
  });
});
