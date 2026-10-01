import type { UserPool } from "@clc/api/features/pools/client";
import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { BackendApiError } from "@clc/api/client/errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  fetchCatalog: vi.fn(),
  getBlockNumber: vi.fn(),
  multicall: vi.fn(),
}));

vi.mock("#/features/pools/hooks/use-filtered-pools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/pools/hooks/use-filtered-pools")>();
  return {
    ...actual,
    fetchFilteredPoolCatalog: (...args: unknown[]) => mocks.fetchCatalog(...args),
  };
});

vi.mock("viem/actions", () => ({
  getBlockNumber: () => mocks.getBlockNumber(),
  multicall: (_client: unknown, args: unknown) => mocks.multicall(args),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "output-test-client" }) }));

import { usePoolOutputAvailability } from "./use-pool-output-availability";

const VOUCHER: VoucherRef = {
  chainId: 100,
  address: "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363",
};
const OTHER_VOUCHER: VoucherRef = {
  chainId: 100,
  address: "0x2000000000000000000000000000000000000002",
};
const REGISTRY = "0x3000000000000000000000000000000000000000" as const;

function pool(index: number, overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: String(index),
    address: `0x${index.toString(16).padStart(40, "0")}`,
    tokenRegistryAddress: REGISTRY,
    feesDecoupled: false,
    ...overrides,
  } as UserPool;
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function success(result: unknown) {
  return { status: "success", result };
}

beforeEach(() => {
  mocks.fetchCatalog.mockReset();
  mocks.getBlockNumber.mockReset().mockResolvedValue(88n);
  mocks.multicall.mockReset();
});

describe("usePoolOutputAvailability", () => {
  it("stays idle without a selected output voucher", () => {
    const { result } = renderHook(() => usePoolOutputAvailability(undefined), {
      wrapper: wrapper(),
    });

    expect(result.current.status).toBe("idle");
    expect(mocks.fetchCatalog).not.toHaveBeenCalled();
    expect(mocks.multicall).not.toHaveBeenCalled();
  });

  it("discovers the relationship and verifies all output liquidity at one block", async () => {
    const coupled = pool(1);
    const decoupled = pool(2, { feesDecoupled: true });
    mocks.fetchCatalog.mockResolvedValue({
      pools: [coupled, decoupled],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValue([
      success(10n),
      { status: "failure" },
      success(true),
      success(10n),
      success(3n),
      success(true),
    ]);

    const { result } = renderHook(() => usePoolOutputAvailability(VOUCHER), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools.map((entry) => entry.address)).toEqual([
      coupled.address,
      decoupled.address,
    ]);
    expect(mocks.fetchCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ vouchers: [VOUCHER] }),
      }),
    );
    expect(mocks.getBlockNumber).toHaveBeenCalledOnce();
    const [{ allowFailure, blockNumber, contracts }] = mocks.multicall.mock.calls[0] as [
      {
        allowFailure: boolean;
        blockNumber: bigint;
        contracts: Array<{ functionName: string }>;
      },
    ];
    expect(allowFailure).toBe(true);
    expect(blockNumber).toBe(88n);
    expect(contracts.map((contract) => contract.functionName)).toEqual([
      "balanceOf",
      "fees",
      "have",
      "balanceOf",
      "fees",
      "have",
    ]);
  });

  it("excludes zero liquidity, reserved fees, and rejected registry members", async () => {
    mocks.fetchCatalog.mockResolvedValue({
      pools: [pool(1), pool(2, { feesDecoupled: true }), pool(3)],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValue([
      success(0n),
      success(0n),
      success(true),
      success(10n),
      success(10n),
      success(true),
      success(10n),
      success(0n),
      success(false),
    ]);

    const { result } = renderHook(() => usePoolOutputAvailability(VOUCHER), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([]);
    expect(result.current.hasVerificationGaps).toBe(false);
  });

  it("ignores the placeholder membership read when a pool has no registry", async () => {
    const registryFree = pool(1, { tokenRegistryAddress: null });
    mocks.fetchCatalog.mockResolvedValue({
      pools: [registryFree],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValue([success(1n), { status: "failure" }, { status: "failure" }]);

    const { result } = renderHook(() => usePoolOutputAvailability(VOUCHER), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([registryFree]);
    expect(result.current.hasVerificationGaps).toBe(false);
  });

  it("treats an unknown but valid catalog address as an empty result", async () => {
    mocks.fetchCatalog.mockRejectedValue(new BackendApiError(400, "unknown voucher"));

    const { result } = renderHook(() => usePoolOutputAvailability(VOUCHER), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([]);
    expect(mocks.multicall).not.toHaveBeenCalled();
  });

  it("excludes unreadable required data and reports a verification gap", async () => {
    mocks.fetchCatalog.mockResolvedValue({
      pools: [pool(1, { feesDecoupled: true })],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValue([success(10n), { status: "failure" }, success(true)]);

    const { result } = renderHook(() => usePoolOutputAvailability(VOUCHER), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([]);
    expect(result.current.hasVerificationGaps).toBe(true);
  });

  it("retains verified data and marks it stale when a refresh fails", async () => {
    const available = pool(1);
    mocks.fetchCatalog.mockResolvedValue({
      pools: [available],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValueOnce([success(10n), success(0n), success(true)]);

    const { result } = renderHook(() => usePoolOutputAvailability(VOUCHER), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    mocks.multicall.mockRejectedValueOnce(new Error("rpc unavailable"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));

    expect(result.current.status).toBe("ready");
    expect(result.current.pools).toEqual([available]);
    expect(result.current.hasVerificationGaps).toBe(true);
  });

  it("never carries the previous voucher's pools into a new selection", async () => {
    const first = pool(1);
    const second = pool(2);
    mocks.fetchCatalog.mockImplementation(
      async ({ filter }: { filter: { vouchers: VoucherRef[] } }) => ({
        pools: filter.vouchers[0]?.address === VOUCHER.address ? [first] : [second],
        tagFacets: null,
        voucherFacets: null,
      }),
    );
    let finishSecondRead: ((value: unknown[]) => void) | undefined;
    mocks.multicall
      .mockResolvedValueOnce([success(10n), success(0n), success(true)])
      .mockImplementationOnce(
        () =>
          new Promise<unknown[]>((resolve) => {
            finishSecondRead = resolve;
          }),
      );

    const { result, rerender } = renderHook(
      ({ voucher }: { voucher: VoucherRef }) => usePoolOutputAvailability(voucher),
      { wrapper: wrapper(), initialProps: { voucher: VOUCHER } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([first]);

    rerender({ voucher: OTHER_VOUCHER });
    await waitFor(() => expect(mocks.multicall).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe("loading");
    expect(result.current.pools).toEqual([]);

    finishSecondRead?.([success(10n), success(0n), success(true)]);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([second]);
  });
});
