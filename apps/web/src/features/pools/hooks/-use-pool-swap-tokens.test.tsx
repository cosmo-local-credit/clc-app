import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { multicallMock } = vi.hoisted(() => ({ multicallMock: vi.fn() }));

vi.mock("viem/actions", () => ({
  multicall: (_client: unknown, args: unknown) => multicallMock(args),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "test-client" }) }));

import { usePoolSwapTokenReads } from "./use-pool-swap-tokens";

const POOL = "0xdD97a5282D11e55d7271d466C80963d6793B276f" as const;
const LIMITER = "0x4D9000000000000000000000000000000000a1C7" as const;
const HOLDER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const KAW = "0xAaA0000000000000000000000000000000000001" as const;
const SAR = "0xbBb0000000000000000000000000000000000002" as const;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return { address: POOL, limiterAddress: LIMITER, ...overrides } as UserPool;
}

function voucher(tokenAddress: string): PoolVoucher {
  return { tokenAddress, decimals: 6 } as PoolVoucher;
}

beforeEach(() => {
  multicallMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  multicallMock.mockReset();
});

describe("usePoolSwapTokenReads", () => {
  it("batches four reads a voucher and keys them by lowercased address", async () => {
    multicallMock.mockResolvedValue(
      [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n].map((result) => ({ status: "success", result })),
    );

    const { result } = renderHook(
      () => usePoolSwapTokenReads(pool(), [voucher(KAW), voucher(SAR)], HOLDER),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(multicallMock).toHaveBeenCalledOnce();
    const [[{ allowFailure, contracts }]] = multicallMock.mock.calls as Array<
      [{ allowFailure: boolean; contracts: Array<{ functionName: string; args?: unknown[] }> }]
    >;
    expect(allowFailure).toBe(true);
    expect(contracts.map((contract) => contract.functionName)).toEqual([
      "balanceOf",
      "balanceOf",
      "fees",
      "limitOf",
      "balanceOf",
      "balanceOf",
      "fees",
      "limitOf",
    ]);
    // The first balance is the holder's, the second the pool's — the screen shows
    // them in different columns and must not confuse them.
    expect(contracts[0]?.args?.[0]).toBe(HOLDER);
    expect(contracts[1]?.args?.[0]).toBe(POOL);
    // Addresses are sorted, so KAW precedes SAR whatever order the catalog paged
    // them in.
    expect(result.current.data?.get(KAW.toLowerCase())).toEqual({
      holderBalanceRaw: "1",
      poolBalanceRaw: "2",
      feesRaw: "3",
      limitRaw: "4",
    });
    expect(result.current.data?.get(SAR.toLowerCase())?.holderBalanceRaw).toBe("5");
  });

  it("reports no cap for a pool with no limiter", async () => {
    multicallMock.mockResolvedValue(
      [1n, 2n, 3n, 4n].map((result) => ({ status: "success", result })),
    );

    const { result } = renderHook(
      () => usePoolSwapTokenReads(pool({ limiterAddress: null }), [voucher(KAW)], HOLDER),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(KAW.toLowerCase())?.limitRaw).toBeNull();
  });

  it("degrades a single failed read instead of emptying the list", async () => {
    multicallMock.mockResolvedValue([
      { status: "success", result: 10n },
      { status: "success", result: 20n },
      { status: "failure" },
      { status: "failure" },
    ]);

    const { result } = renderHook(() => usePoolSwapTokenReads(pool(), [voucher(KAW)], HOLDER), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(KAW.toLowerCase())).toEqual({
      holderBalanceRaw: "10",
      poolBalanceRaw: "20",
      // A balance nobody could read is zero — the row lists, unheld.
      feesRaw: "0",
      // A cap nobody could read is unknown, which is not a cap of nothing.
      limitRaw: null,
    });
  });

  it("issues no request without a holder, a pool, or a voucher", async () => {
    const wrapper = createWrapper();
    renderHook(() => usePoolSwapTokenReads(pool(), [voucher(KAW)], undefined), { wrapper });
    renderHook(() => usePoolSwapTokenReads(undefined, [voucher(KAW)], HOLDER), { wrapper });
    renderHook(() => usePoolSwapTokenReads(pool(), [], HOLDER), { wrapper });

    await waitFor(() => expect(multicallMock).not.toHaveBeenCalled());
  });

  it("does not refetch when the catalog pages the same vouchers back reordered", async () => {
    multicallMock.mockResolvedValue(
      [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n].map((result) => ({ status: "success", result })),
    );
    const wrapper = createWrapper();

    const { rerender, result } = renderHook(
      ({ vouchers }: { vouchers: PoolVoucher[] }) =>
        usePoolSwapTokenReads(pool(), vouchers, HOLDER),
      { wrapper, initialProps: { vouchers: [voucher(KAW), voucher(SAR)] } },
    );
    await waitFor(() => expect(result.current.data).toBeTruthy());

    rerender({ vouchers: [voucher(SAR), voucher(KAW)] });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(multicallMock).toHaveBeenCalledOnce();
  });
});
