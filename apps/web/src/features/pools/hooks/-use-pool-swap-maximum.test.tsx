import {
  swapPoolGetQuoteAbi,
  swapRouterQuoteExactInputAbi,
} from "@clc/core/features/pool-swaps/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  CallExecutionError,
  ExecutionRevertedError,
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
} from "viem";
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

/** Answers `getQuote` at parity and the router's `quoteExactInput` with `netOf(amount)`. */
function mockQuotes(netOf: (amountIn: bigint) => bigint | Error) {
  callMock.mockImplementation(({ data }: { data: Hex }) => {
    try {
      const decoded = decodeFunctionData({ abi: swapPoolGetQuoteAbi, data });
      return Promise.resolve({
        data: encodeFunctionResult({
          abi: swapPoolGetQuoteAbi,
          functionName: "getQuote",
          result: decoded.args[2],
        }),
      });
    } catch {
      const decoded = decodeFunctionData({ abi: swapRouterQuoteExactInputAbi, data });
      const net = netOf(decoded.args[1]);
      if (net instanceof Error) return Promise.reject(net);
      return Promise.resolve({
        data: encodeFunctionResult({
          abi: swapRouterQuoteExactInputAbi,
          functionName: "quoteExactInput",
          result: net,
        }),
      });
    }
  });
}

function renderMaximum(overrides: Partial<Parameters<typeof usePoolSwapMaximum>[0]> = {}) {
  return renderHook(
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
        ...overrides,
      }),
    { wrapper: createWrapper() },
  );
}

describe("usePoolSwapMaximum", () => {
  it("uses the existing snapshot and quotes the pair, then the net receive at the maximum", async () => {
    // 2% of the gross output goes to the pool and the protocol.
    mockQuotes((amountIn) => (amountIn * 98n) / 100n);

    const { result } = renderMaximum();

    await waitFor(() => expect(result.current.data?.maxAmountInRaw).toBe("55"));
    expect(result.current.data).toEqual({
      maxAmountInRaw: "55",
      // What lands with the holder once every fee is out: the contract's own
      // net figure for spending the whole maximum, not a client-side estimate.
      maxAmountOutRaw: "53",
      liquidityInputCeilingRaw: "55",
      blockNumber: 77n,
    });
    expect(callMock).toHaveBeenCalledTimes(4);
    expect(callMock.mock.calls.every(([call]) => call.blockNumber === 77n)).toBe(true);
  });

  it("still offers the maximum when the net receive cannot be quoted", async () => {
    // FeeTooHigh and a zero net both revert `getAmountOut`. The send ceiling is
    // still what it is; only the receive figure is unknown. Shaped as viem's
    // `call` reports a revert from both Gnosis RPCs.
    mockQuotes(
      () => new CallExecutionError(new ExecutionRevertedError({ message: "FeeTooHigh()" }), {}),
    );

    const { result } = renderMaximum();

    await waitFor(() => expect(result.current.data?.maxAmountInRaw).toBe("55"));
    expect(result.current.data?.maxAmountOutRaw).toBeNull();
  });

  it("fails rather than passing a failed read off as a quote the contract refused", async () => {
    // A timeout is no answer about the contract, and caching it as one would hide
    // the receive figure for the rest of the block.
    mockQuotes(() => new Error("request timed out"));

    const { result } = renderMaximum();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("does not quote a receive amount for a maximum of nothing", async () => {
    mockQuotes((amountIn) => amountIn);

    const { result } = renderMaximum({ availableAmountOutRaw: "0" });

    await waitFor(() => expect(result.current.data?.maxAmountInRaw).toBe("0"));
    expect(result.current.data?.maxAmountOutRaw).toBe("0");
    expect(callMock).not.toHaveBeenCalled();
  });

  it("keeps the last maximum for the same pair while a newer block loads, but never across pairs", async () => {
    mockQuotes((amountIn) => amountIn);
    const wrapper = createWrapper();
    const initialProps: { blockNumber: bigint; tokenOut: string } = {
      blockNumber: 77n,
      tokenOut: TOKEN_OUT,
    };
    const { result, rerender } = renderHook(
      (props: { blockNumber: bigint; tokenOut: string }) =>
        usePoolSwapMaximum({
          poolAddress: POOL,
          quoterAddress: null,
          tokenIn: TOKEN_IN,
          tokenOut: props.tokenOut,
          walletBalanceRaw: "995",
          depositHeadroomRaw: "1200",
          availableAmountOutRaw: "55",
          blockNumber: props.blockNumber,
        }),
      { wrapper, initialProps },
    );
    await waitFor(() => expect(result.current.data?.maxAmountInRaw).toBe("55"));

    // The next block's quote never settles: Max must not blink out meanwhile.
    callMock.mockImplementation(() => new Promise(() => {}));
    rerender({ blockNumber: 78n, tokenOut: TOKEN_OUT });
    expect(result.current.data?.maxAmountInRaw).toBe("55");
    expect(result.current.isPlaceholderData).toBe(true);

    // Another output voucher is another question; the old answer is not its.
    rerender({ blockNumber: 78n, tokenOut: "0x4444444444444444444444444444444444444444" });
    expect(result.current.data).toBeUndefined();
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
