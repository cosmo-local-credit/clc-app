import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ME = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const SAFE = "0x00000000000000000000000000000000000000f1";
const STRANGER = "0x00000000000000000000000000000000000000e1";

const { balances, vouchers, pools, signedSafes } = vi.hoisted(() => ({
  balances: { current: {} as Record<string, unknown> },
  vouchers: { current: {} as Record<string, unknown> },
  pools: { current: {} as Record<string, unknown> },
  signedSafes: { current: new Set<string>() },
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAccountTokensInfinite: () => balances.current,
}));
vi.mock("#/features/wallet/hooks/use-partitioned-vouchers", () => ({
  usePartitionedVouchers: () => vouchers.current,
}));
vi.mock("#/features/pools/hooks/use-user-pools", () => ({
  useOwnedPoolsInfinite: () => pools.current,
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useSafeOwnersSignedBy: () => signedSafes.current,
}));
vi.mock("#/features/wallet/logic/account-token-display", () => ({
  accountTokenToWalletToken: (token: { symbol: string }) => ({ id: token.symbol }),
}));

import { useRecoveryAssets } from "./use-recovery-assets";

const pool = (address: string, ownerAddress: string | null) => ({ address, ownerAddress });

beforeEach(() => {
  balances.current = {
    data: { pages: [{ tokens: [{ symbol: "A" }] }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  };
  vouchers.current = {
    holdings: [{ id: "A" }],
    issued: [{ id: "B" }],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  pools.current = {
    data: {
      pages: [
        {
          pools: [
            pool("0xmine", ME.toLowerCase()),
            pool("0xsafe", SAFE),
            pool("0xother", STRANGER),
            pool("0xnone", null),
          ],
        },
      ],
    },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  };
  signedSafes.current = new Set([SAFE]);
});

describe("useRecoveryAssets", () => {
  it("keeps the pools the account, or a Safe it signs for, owns", () => {
    const { result } = renderHook(() => useRecoveryAssets(ME));

    expect(result.current.pools.map((pool) => pool.address)).toEqual(["0xmine", "0xsafe"]);
    expect(result.current.holdings).toEqual([{ id: "A" }]);
    expect(result.current.issued).toEqual([{ id: "B" }]);
  });

  it("drops a Safe the account does not sign for", () => {
    signedSafes.current = new Set();
    const { result } = renderHook(() => useRecoveryAssets(ME));

    expect(result.current.pools.map((pool) => pool.address)).toEqual(["0xmine"]);
  });

  it("is pending until both the balances and the issued list have answered", () => {
    balances.current = { ...balances.current, isPending: true };
    expect(renderHook(() => useRecoveryAssets(ME)).result.current.vouchersPending).toBe(true);

    balances.current = { ...balances.current, isPending: false };
    vouchers.current = { ...vouchers.current, isPending: true };
    expect(renderHook(() => useRecoveryAssets(ME)).result.current.vouchersPending).toBe(true);
  });

  it("reports an error from either list and retries both", () => {
    vouchers.current = { ...vouchers.current, isError: true };
    const { result } = renderHook(() => useRecoveryAssets(ME));
    expect(result.current.vouchersError).toBe(true);

    result.current.retryVouchers();

    expect(balances.current.refetch).toHaveBeenCalled();
    expect(vouchers.current.refetch).toHaveBeenCalled();
  });

  it("pages balances and pools", () => {
    balances.current = { ...balances.current, hasNextPage: true, isFetchingNextPage: true };
    pools.current = { ...pools.current, hasNextPage: true };
    const { result } = renderHook(() => useRecoveryAssets(ME));

    expect(result.current.hasMoreBalances).toBe(true);
    expect(result.current.fetchingMoreBalances).toBe(true);
    expect(result.current.hasMorePools).toBe(true);
    result.current.loadMoreBalances();
    result.current.loadMorePools();
    result.current.retryPools();
    expect(balances.current.fetchNextPage).toHaveBeenCalled();
    expect(pools.current.fetchNextPage).toHaveBeenCalled();
    expect(pools.current.refetch).toHaveBeenCalled();
  });

  it("has no pools and no balances before anything has loaded", () => {
    balances.current = { ...balances.current, data: undefined, isPending: true };
    pools.current = { ...pools.current, data: undefined, isPending: true, isError: false };
    const { result } = renderHook(() => useRecoveryAssets(ME));

    expect(result.current.pools).toEqual([]);
    expect(result.current.poolsPending).toBe(true);
    expect(result.current.poolsError).toBe(false);
  });
});
