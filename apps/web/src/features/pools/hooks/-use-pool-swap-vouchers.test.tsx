import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { catalog, metadata, registry } = vi.hoisted(() => ({
  catalog: {
    value: {
      vouchers: [] as unknown[],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
  },
  registry: {
    value: {
      data: undefined as string[] | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
  },
  metadata: {
    value: {
      data: undefined as Map<string, unknown> | undefined,
      isPending: false,
      refetch: vi.fn(),
    },
    requested: [] as string[][],
  },
}));

vi.mock("./use-pool-vouchers", () => ({
  usePoolVouchersWithStatus: () => catalog.value,
}));

vi.mock("./use-pool-registry", () => ({
  usePoolRegistryTokens: () => registry.value,
  usePoolTokenMetadata: (addresses: string[]) => {
    metadata.requested.push(addresses);
    return metadata.value;
  },
}));

import { usePoolSwapVouchers } from "./use-pool-swap-vouchers";

const REGISTRY = "0x7777777777777777777777777777777777777777" as const;
const KAW = "0xaaa0000000000000000000000000000000000001";
const PLK = "0xccc0000000000000000000000000000000000003";

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return { address: "0x1", tokenRegistryAddress: REGISTRY, ...overrides } as UserPool;
}

function voucher(tokenAddress: string, symbol: string): PoolVoucher {
  return { id: symbol, tokenAddress, symbol, name: symbol, decimals: 6 } as PoolVoucher;
}

beforeEach(() => {
  catalog.value = { vouchers: [], isPending: false, isError: false, refetch: vi.fn() };
  registry.value = { data: undefined, isPending: false, isError: false, refetch: vi.fn() };
  metadata.value = { data: undefined, isPending: false, refetch: vi.fn() };
  metadata.requested = [];
});

describe("usePoolSwapVouchers", () => {
  it("adds a registry member the catalog is missing and asks the chain only about it", () => {
    catalog.value.vouchers = [voucher(KAW, "KAW")];
    registry.value.data = [KAW, PLK];
    metadata.value.data = new Map([[PLK, { symbol: "PLK", name: "Plank", decimals: 18 }]]);

    const { result } = renderHook(() => usePoolSwapVouchers(pool()));

    expect(result.current.vouchers.map((entry) => entry.symbol)).toEqual(["KAW", "PLK"]);
    expect(result.current.isPending).toBe(false);
    expect(metadata.requested.at(-1)).toEqual([PLK]);
  });

  it("stays pending until the registry has answered", () => {
    catalog.value.vouchers = [voucher(KAW, "KAW")];
    registry.value.isPending = true;

    const { result } = renderHook(() => usePoolSwapVouchers(pool()));

    expect(result.current.isPending).toBe(true);
  });

  it("stays pending while the metadata for a missing member is in flight", () => {
    registry.value.data = [PLK];
    metadata.value.isPending = true;

    const { result } = renderHook(() => usePoolSwapVouchers(pool()));

    expect(result.current.isPending).toBe(true);
  });

  it("reports an unreadable registry as an error rather than falling back to the catalog", () => {
    catalog.value.vouchers = [voucher(KAW, "KAW")];
    registry.value.isError = true;

    const { result } = renderHook(() => usePoolSwapVouchers(pool()));

    expect(result.current.isError).toBe(true);
    expect(result.current.vouchers).toEqual([]);
  });

  it("uses the catalog alone for a pool with no registry", () => {
    catalog.value.vouchers = [voucher(KAW, "KAW")];

    const { result } = renderHook(() => usePoolSwapVouchers(pool({ tokenRegistryAddress: null })));

    expect(result.current.vouchers.map((entry) => entry.symbol)).toEqual(["KAW"]);
    expect(result.current.isPending).toBe(false);
  });

  it("surfaces a catalog failure", () => {
    catalog.value.isError = true;
    registry.value.data = [];

    const { result } = renderHook(() => usePoolSwapVouchers(pool()));

    expect(result.current.isError).toBe(true);
  });

  it("refetches every source", () => {
    const { result } = renderHook(() => usePoolSwapVouchers(pool()));

    result.current.refetch();

    expect(catalog.value.refetch).toHaveBeenCalledOnce();
    expect(registry.value.refetch).toHaveBeenCalledOnce();
  });
});
