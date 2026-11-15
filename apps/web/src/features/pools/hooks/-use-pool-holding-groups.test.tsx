import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  accepted: vi.fn(),
  holdings: vi.fn(),
  registryAddress: null as string | null,
}));

vi.mock("#/features/pools/hooks/use-pool-swap-vouchers", () => ({
  usePoolAcceptedVouchers: (...args: unknown[]) => mocks.accepted(...args),
}));
vi.mock("#/features/pools/hooks/use-pool-holdings", () => ({
  usePoolHoldings: (...args: unknown[]) => mocks.holdings(...args),
}));
vi.mock("#/features/pools/hooks/use-pool-registry", () => ({
  poolTokenRegistryAddress: () => mocks.registryAddress,
}));

import { usePoolHoldingGroups } from "./use-pool-holding-groups";

const POOL = {
  address: "0x1111111111111111111111111111111111111111",
} as unknown as UserPool;
const ACCEPTED = "0x2222222222222222222222222222222222222222";
const PENDING = "0x3333333333333333333333333333333333333333";
const voucher = {
  tokenAddress: ACCEPTED,
  name: "Accepted Voucher",
  symbol: "YES",
} as unknown as PoolVoucher;
const holding = (address: string, name: string, balanceRaw: string) =>
  ({
    tokenAddress: address.toLowerCase(),
    name,
    symbol: name.slice(0, 3).toUpperCase(),
    balanceRaw,
  }) as never;

beforeEach(() => {
  mocks.registryAddress = null;
  mocks.accepted.mockReset().mockReturnValue({
    vouchers: [voucher],
    verified: true,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  mocks.holdings.mockReset().mockReturnValue({
    holdings: [holding(ACCEPTED, "Accepted Voucher", "0"), holding(PENDING, "Deposit", "5")],
    unit: "KES",
    feeds: null,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
});

it("keeps accepted zero balances and separates positive deposits", () => {
  const catalog = {
    vouchers: [voucher],
    hasData: true,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  const { result } = renderHook(() => usePoolHoldingGroups(POOL, catalog));

  expect(result.current.accepted.map((row) => row.holding.tokenAddress)).toEqual([
    ACCEPTED.toLowerCase(),
  ]);
  expect(result.current.pending.map((row) => row.tokenAddress)).toEqual([PENDING.toLowerCase()]);
  expect(mocks.holdings).toHaveBeenCalledWith(POOL, [voucher]);
});

it("marks an initial authoritative-membership failure as unverified", () => {
  mocks.registryAddress = "0x4444444444444444444444444444444444444444";
  mocks.accepted.mockReturnValue({
    vouchers: [],
    verified: false,
    isPending: false,
    isError: true,
    isFetching: false,
    refetch: vi.fn(),
  });
  const { result } = renderHook(() =>
    usePoolHoldingGroups(POOL, {
      vouchers: [],
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
  );

  expect(result.current.verified).toBe(false);
  expect(result.current.isError).toBe(true);
});

it("retains a verified catalog fallback through a failed refresh and retries every source", () => {
  const retryCatalog = vi.fn();
  const retryAccepted = vi.fn();
  const retryHoldings = vi.fn();
  mocks.accepted.mockReturnValue({
    vouchers: [voucher],
    verified: true,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: retryAccepted,
  });
  mocks.holdings.mockReturnValue({
    holdings: [holding(ACCEPTED, "Accepted Voucher", "0")],
    unit: "KES",
    feeds: null,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: retryHoldings,
  });
  const { result } = renderHook(() =>
    usePoolHoldingGroups(POOL, {
      vouchers: [voucher],
      hasData: true,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: retryCatalog,
    }),
  );

  expect(result.current.verified).toBe(true);
  result.current.refetch();
  expect(retryHoldings).toHaveBeenCalledOnce();
  expect(retryAccepted).toHaveBeenCalledOnce();
  expect(retryCatalog).toHaveBeenCalledOnce();
});
