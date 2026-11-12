import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  allTokens: vi.fn(),
  treasury: vi.fn(),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: (...args: unknown[]) => mocks.allTokens(...args),
}));
vi.mock("#/features/pools/hooks/use-pool-treasury", () => ({
  usePoolTreasury: (...args: unknown[]) => mocks.treasury(...args),
}));
vi.mock("#/features/pools/hooks/use-pool-quoter", () => ({
  usePoolQuoterKind: () => ({ kind: "decimal" }),
  usePoolVoucherRatesByAddress: () => ({
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  usePoolVoucherFeedStatuses: () => null,
}));

import { usePoolHoldings } from "./use-pool-holdings";

const POOL = "0x1111111111111111111111111111111111111111";
const ACCEPTED = "0x2222222222222222222222222222222222222222";
const OLDER_DEPOSIT = "0x3333333333333333333333333333333333333333";

beforeEach(() => {
  mocks.allTokens.mockReset().mockReturnValue({
    // This list is the fully drained result. The older deposit is deliberately
    // absent from the accepted catalog and still has to reach Holdings.
    tokens: [
      {
        id: 1001,
        tokenAddress: OLDER_DEPOSIT,
        tokenName: "Older Deposit",
        tokenSymbol: "OLD",
        tokenDecimals: 6,
        balance: "5000000",
        iconUrl: null,
        lastDateBlock: "2026-01-01T00:00:00Z",
      },
    ],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  mocks.treasury.mockReset().mockReturnValue({
    data: new Map([
      [
        ACCEPTED.toLowerCase(),
        { balanceRaw: "0", feesRaw: "0", withdrawableRaw: "0", limitRaw: null },
      ],
      [
        OLDER_DEPOSIT.toLowerCase(),
        {
          balanceRaw: "5000000",
          feesRaw: "0",
          withdrawableRaw: "5000000",
          limitRaw: null,
        },
      ],
    ]),
    isPending: false,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
});

it("feeds every paginated account token into the Pool treasury and holdings union", () => {
  const pool = {
    address: POOL,
    symbol: "POOL",
    limiterAddress: null,
  } as unknown as UserPool;
  const vouchers = [
    {
      tokenAddress: ACCEPTED,
      name: "Accepted Voucher",
      symbol: "YES",
      decimals: 6,
      iconUrl: null,
      tokenLimit: null,
    },
  ] as unknown as PoolVoucher[];

  const { result } = renderHook(() => usePoolHoldings(pool, vouchers));

  expect(mocks.allTokens).toHaveBeenCalledWith(POOL);
  expect(mocks.treasury.mock.calls[0]?.[1]).toEqual([ACCEPTED, OLDER_DEPOSIT]);
  expect(result.current.holdings.map((holding) => holding.tokenAddress)).toContain(
    OLDER_DEPOSIT.toLowerCase(),
  );
});

it("waits for an empty paginated token read and discloses an incomplete read", () => {
  mocks.allTokens.mockReturnValue({
    tokens: [],
    isPending: true,
    isError: false,
    isFetching: true,
    refetch: vi.fn(),
  });
  mocks.treasury.mockReturnValue({
    data: new Map(),
    isPending: false,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  const pool = {
    address: POOL,
    symbol: "POOL",
    limiterAddress: null,
  } as unknown as UserPool;

  const pending = renderHook(() => usePoolHoldings(pool, [])).result;
  expect(pending.current.isPending).toBe(true);

  mocks.allTokens.mockReturnValue({
    tokens: [],
    isPending: false,
    isError: true,
    isFetching: false,
    refetch: vi.fn(),
  });
  const failed = renderHook(() => usePoolHoldings(pool, [])).result;
  expect(failed.current.isError).toBe(true);
});
