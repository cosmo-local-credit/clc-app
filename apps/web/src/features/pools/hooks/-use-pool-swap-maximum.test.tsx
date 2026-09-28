import { swapPoolGetQuoteAbi } from "@clc/core/features/pool-swaps/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock("viem/actions", () => ({
  call: (_client: unknown, args: unknown) => callMock(args),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "test-client" }) }));

import { usePoolSwapMaximum } from "./use-pool-swap-maximum";

const POOL = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_IN = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_OUT = "0x3333333333333333333333333333333333333333" as const;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  callMock.mockReset();
});

describe("usePoolSwapMaximum", () => {
  it("uses the existing snapshot and only calls the pair quote", async () => {
    callMock.mockImplementation(({ data }: { data: Hex }) => {
      const decoded = decodeFunctionData({ abi: swapPoolGetQuoteAbi, data });
      return Promise.resolve({
        data: encodeFunctionResult({
          abi: swapPoolGetQuoteAbi,
          functionName: "getQuote",
          result: decoded.args[2],
        }),
      });
    });

    const { result } = renderHook(
      () =>
        usePoolSwapMaximum({
          poolAddress: POOL,
          quoterAddress: null,
          tokenIn: TOKEN_IN,
          tokenOut: TOKEN_OUT,
          walletBalanceRaw: "995",
          depositHeadroomRaw: "1200",
          availableAmountOutRaw: "55",
          blockNumber: 77n,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data?.maxAmountInRaw).toBe("55"));
    expect(result.current.data).toEqual({
      maxAmountInRaw: "55",
      liquidityInputCeilingRaw: "55",
      blockNumber: 77n,
    });
    expect(callMock).toHaveBeenCalledTimes(3);
    expect(callMock.mock.calls.every(([call]) => call.blockNumber === 77n)).toBe(true);
  });

  it("does not quote when a configured limiter's cap is unknown", async () => {
    const { result } = renderHook(
      () =>
        usePoolSwapMaximum({
          poolAddress: POOL,
          quoterAddress: null,
          tokenIn: TOKEN_IN,
          tokenOut: TOKEN_OUT,
          walletBalanceRaw: "995",
          depositHeadroomRaw: undefined,
          availableAmountOutRaw: "55",
          blockNumber: 77n,
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(callMock).not.toHaveBeenCalled();
  });
});
