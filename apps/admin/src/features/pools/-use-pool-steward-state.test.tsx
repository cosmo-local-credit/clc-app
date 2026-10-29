import type { UserPool } from "@clc/api/features/pools/client";
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("#/lib/chain-client", () => ({ getChainClient: () => ({ chain: 100 }) }));
vi.mock("viem/actions", () => ({ readContract: (...args: unknown[]) => state.read(...args) }));

import { usePoolStewardState } from "./use-pool-steward";

const pool = {
  id: "1",
  chainId: 100,
  address: "0x1000000000000000000000000000000000000001",
  feePolicyAddress: "0x2000000000000000000000000000000000000002",
  quoterType: "oracle",
  quoterAddress: "0x3000000000000000000000000000000000000003",
} as unknown as UserPool;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => state.read.mockReset());

describe("usePoolStewardState", () => {
  it("normalizes live number, address, and bigint values", async () => {
    const results = [
      3,
      "0x4000000000000000000000000000000000000004",
      "0x5000000000000000000000000000000000000005",
      1n,
      60n,
      950000n,
    ];
    state.read.mockImplementation(() => Promise.resolve(results[state.read.mock.calls.length - 1]));
    const { result } = renderHook(() => usePoolStewardState(pool), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      sealState: 3,
      defaultFeePpm: "1",
      maxStaleness: "60",
      multiplierPpm: "950000",
    });
  });

  it("returns nulls for unexpected contract result types", async () => {
    state.read.mockResolvedValue({ unexpected: true });
    const { result } = renderHook(() => usePoolStewardState(pool), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      sealState: null,
      feeAddress: null,
      owner: null,
      defaultFeePpm: null,
      maxStaleness: null,
      multiplierPpm: null,
    });
  });
});
