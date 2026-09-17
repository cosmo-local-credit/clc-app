import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { multicallMock } = vi.hoisted(() => ({ multicallMock: vi.fn() }));

vi.mock("viem/actions", () => ({
  multicall: (_client: unknown, args: unknown) => multicallMock(args),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "test-client" }) }));

import { usePoolTreasury } from "./use-pool-treasury";

const POOL = "0xdD97a5282D11e55d7271d466C80963d6793B276f" as const;
const BLTI = "0xB658239D5CAd8F96EdB025D87EE77cd0Abd6723C" as const;
const RYZN = "0xDd0A51AE0DA278a2eEAb37A7E865842EEb861fbd" as const;

function success(result: bigint | boolean) {
  return { status: "success", result } as const;
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return { address: POOL, feesDecoupled: false, ...overrides } as UserPool;
}

beforeEach(() => {
  multicallMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  multicallMock.mockReset();
});

describe("usePoolTreasury", () => {
  it("reads the fee mode, balances and fees in one batch and reserves decoupled fees", async () => {
    // The catalog says coupled on purpose. The immutable contract flag is the
    // authority and prevents a sparse imported catalog row from overstating liquidity.
    multicallMock.mockResolvedValue([true, 7_430_000n, 3_930_000n, 196_500_000n, 0n].map(success));

    const { result } = renderHook(
      () => usePoolTreasury(pool(), [RYZN, BLTI, BLTI.toLowerCase()], true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(multicallMock).toHaveBeenCalledOnce();
    const [[{ allowFailure, contracts }]] = multicallMock.mock.calls as Array<
      [{ allowFailure: boolean; contracts: Array<{ functionName: string; args?: unknown[] }> }]
    >;
    expect(allowFailure).toBe(true);
    expect(contracts.map((contract) => contract.functionName)).toEqual([
      "feesDecoupled",
      "balanceOf",
      "fees",
      "balanceOf",
      "fees",
    ]);
    expect(result.current.data?.get(BLTI.toLowerCase())).toEqual({
      balanceRaw: "7430000",
      feesRaw: "3930000",
      withdrawableRaw: "3500000",
    });
    expect(result.current.data?.get(RYZN.toLowerCase())?.withdrawableRaw).toBe("196500000");
  });

  it("keeps fees in available liquidity when the contract couples them", async () => {
    multicallMock.mockResolvedValue([false, 7_430_000n, 3_930_000n].map(success));

    const { result } = renderHook(() => usePoolTreasury(pool(), [BLTI], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(BLTI.toLowerCase())?.withdrawableRaw).toBe("7430000");
  });

  it("floors available liquidity at zero when reserved fees exceed the balance", async () => {
    multicallMock.mockResolvedValue([true, 3_000_000n, 4_000_000n].map(success));

    const { result } = renderHook(() => usePoolTreasury(pool(), [BLTI], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(BLTI.toLowerCase())?.withdrawableRaw).toBe("0");
  });

  it("issues no request without a pool, token, or enabled consumer", async () => {
    const wrapper = createWrapper();
    renderHook(() => usePoolTreasury(undefined, [BLTI], true), { wrapper });
    renderHook(() => usePoolTreasury(pool(), [], true), { wrapper });
    renderHook(() => usePoolTreasury(pool(), [BLTI], false), { wrapper });

    await waitFor(() => expect(multicallMock).not.toHaveBeenCalled());
  });

  it("keeps healthy tokens when one token read fails", async () => {
    multicallMock.mockResolvedValue([
      success(true),
      { status: "failure", error: new Error("not an ERC-20") },
      success(0n),
      success(196_500_000n),
      success(0n),
    ]);

    const { result } = renderHook(() => usePoolTreasury(pool(), [BLTI, RYZN], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.has(BLTI.toLowerCase())).toBe(false);
    expect(result.current.data?.get(RYZN.toLowerCase())?.withdrawableRaw).toBe("196500000");
  });

  it("does not refetch when the same token addresses are reordered", async () => {
    multicallMock.mockResolvedValue([false, 7_430_000n, 3_930_000n, 196_500_000n, 0n].map(success));
    const wrapper = createWrapper();
    const { rerender, result } = renderHook(
      ({ addresses }: { addresses: string[] }) => usePoolTreasury(pool(), addresses, true),
      { wrapper, initialProps: { addresses: [BLTI, RYZN] } },
    );
    await waitFor(() => expect(result.current.data).toBeTruthy());

    rerender({ addresses: [RYZN, BLTI] });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(multicallMock).toHaveBeenCalledOnce();
  });
});
