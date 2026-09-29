import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { getBlockNumberMock, multicallMock, readContractMock } = vi.hoisted(() => ({
  getBlockNumberMock: vi.fn(),
  multicallMock: vi.fn(),
  readContractMock: vi.fn(),
}));

vi.mock("viem/actions", () => ({
  getBlockNumber: (_client: unknown) => getBlockNumberMock(),
  multicall: (_client: unknown, args: unknown) => multicallMock(args),
  readContract: (_client: unknown, args: unknown) => readContractMock(args),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "test-client" }) }));

import { usePoolRegistryTokens, usePoolTokenMetadata } from "./use-pool-registry";

const REGISTRY = "0x7777777777777777777777777777777777777777" as const;
const KAW = "0xAaA0000000000000000000000000000000000001" as const;
const PLK = "0xccc0000000000000000000000000000000000003" as const;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return { tokenRegistryAddress: REGISTRY, ...overrides } as UserPool;
}

beforeEach(() => {
  getBlockNumberMock.mockResolvedValue(88n);
});

afterEach(() => {
  getBlockNumberMock.mockReset();
  multicallMock.mockReset();
  readContractMock.mockReset();
});

describe("usePoolRegistryTokens", () => {
  it("enumerates every entry at one pinned block", async () => {
    readContractMock.mockResolvedValue(2n);
    multicallMock.mockResolvedValue([KAW, PLK]);

    const { result } = renderHook(() => usePoolRegistryTokens(pool()), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([KAW, PLK]));
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY,
        functionName: "entryCount",
        blockNumber: 88n,
      }),
    );
    const [[{ allowFailure, blockNumber, contracts }]] = multicallMock.mock.calls as Array<
      [
        {
          allowFailure: boolean;
          blockNumber: bigint;
          contracts: Array<{ address: string; functionName: string; args: bigint[] }>;
        },
      ]
    >;
    // A member that cannot be read must fail the list rather than vanish from it.
    expect(allowFailure).toBe(false);
    expect(blockNumber).toBe(88n);
    expect(contracts.map((contract) => contract.args[0])).toEqual([0n, 1n]);
    expect(contracts.every((contract) => contract.functionName === "entry")).toBe(true);
    expect(contracts.every((contract) => contract.address === REGISTRY)).toBe(true);
  });

  it("returns an empty list without a multicall for an empty registry", async () => {
    readContractMock.mockResolvedValue(0n);

    const { result } = renderHook(() => usePoolRegistryTokens(pool()), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(multicallMock).not.toHaveBeenCalled();
  });

  it("is idle for a pool with no registry", () => {
    const { result } = renderHook(
      () => usePoolRegistryTokens(pool({ tokenRegistryAddress: null })),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(readContractMock).not.toHaveBeenCalled();
  });

  it("surfaces a failed read as an error, not as a shorter list", async () => {
    readContractMock.mockRejectedValue(new Error("rpc down"));

    const { result } = renderHook(() => usePoolRegistryTokens(pool()), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("usePoolTokenMetadata", () => {
  it("reads symbol, name and decimals per token, keyed by lowercased address", async () => {
    multicallMock.mockResolvedValue([
      { status: "success", result: "PLK" },
      { status: "success", result: "Plank" },
      { status: "success", result: 18 },
    ]);

    const { result } = renderHook(() => usePoolTokenMetadata([PLK]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(PLK.toLowerCase())).toEqual({
      symbol: "PLK",
      name: "Plank",
      decimals: 18,
    });
    const [[{ allowFailure, contracts }]] = multicallMock.mock.calls as Array<
      [{ allowFailure: boolean; contracts: Array<{ functionName: string }> }]
    >;
    expect(allowFailure).toBe(true);
    expect(contracts.map((contract) => contract.functionName)).toEqual([
      "symbol",
      "name",
      "decimals",
    ]);
  });

  it("degrades an unreadable field to null", async () => {
    multicallMock.mockResolvedValue([
      { status: "failure" },
      { status: "success", result: "Plank" },
      { status: "failure" },
    ]);

    const { result } = renderHook(() => usePoolTokenMetadata([PLK]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(PLK.toLowerCase())).toEqual({
      symbol: null,
      name: "Plank",
      decimals: null,
    });
  });

  it("issues no request when there is nothing to describe", () => {
    const { result } = renderHook(() => usePoolTokenMetadata([]), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(multicallMock).not.toHaveBeenCalled();
  });
});
