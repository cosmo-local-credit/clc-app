import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { UserPool } from "@clc/api/features/pools/client";
import { usePoolSearch } from "./use-pool-search";

const getFilteredPools = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/pools", () => ({ poolsClient: { getFilteredPools } }));

const RESULT = {
  id: "1",
  chainId: 100,
  address: `0x${"a".repeat(40)}`,
  name: "Bicycle pool",
  symbol: "BIKE",
  imageUrl: null,
} as UserPool;

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  getFilteredPools.mockReset();
});

describe("usePoolSearch", () => {
  it("waits for a useful term and performs global relationship-aware search", async () => {
    getFilteredPools.mockResolvedValue({
      pools: [RESULT],
      receivedCount: 1,
      tagFacets: null,
      voucherFacets: null,
    });
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => usePoolSearch(query, vi.fn(), true),
      { wrapper: wrapper(), initialProps: { query: "b" } },
    );

    expect(result.current.status).toBe("idle");
    expect(getFilteredPools).not.toHaveBeenCalled();

    rerender({ query: "bike" });
    expect(result.current.status).toBe("searching");
    expect(result.current.results).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.results).toEqual([RESULT]);
    expect(getFilteredPools).toHaveBeenCalledWith(
      {
        perPage: 10,
        cursor: undefined,
        next: undefined,
        filter: {
          term: "bike",
          tags: [],
          tagMatch: "any",
          vouchers: [],
          voucherMatch: "any",
        },
      },
      expect.any(AbortSignal),
    );
  });

  it("removes prior results immediately while a replacement term settles", async () => {
    getFilteredPools.mockResolvedValue({
      pools: [RESULT],
      receivedCount: 1,
      tagFacets: null,
      voucherFacets: null,
    });
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => usePoolSearch(query, vi.fn(), true),
      { wrapper: wrapper(), initialProps: { query: "bike" } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ query: "bikes" });
    expect(result.current.status).toBe("searching");
    expect(result.current.results).toEqual([]);
  });

  it("cancels an in-flight request when the picker closes", async () => {
    let requestSignal: AbortSignal | undefined;
    getFilteredPools.mockImplementation(
      (_params, signal: AbortSignal | undefined) =>
        new Promise((_resolve, reject) => {
          requestSignal = signal;
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => usePoolSearch("bike", vi.fn(), active),
      { wrapper: wrapper(), initialProps: { active: true } },
    );

    await waitFor(() => expect(getFilteredPools).toHaveBeenCalledTimes(1));
    expect(requestSignal?.aborted).toBe(false);

    act(() => rerender({ active: false }));

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(result.current.status).toBe("idle");
    expect(result.current.results).toEqual([]);
  });

  it("keeps a failed search retryable", async () => {
    getFilteredPools.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
      pools: [RESULT],
      receivedCount: 1,
      tagFacets: null,
      voucherFacets: null,
    });
    const { result } = renderHook(() => usePoolSearch("bike", vi.fn(), true), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.results).toEqual([RESULT]);
  });
});
