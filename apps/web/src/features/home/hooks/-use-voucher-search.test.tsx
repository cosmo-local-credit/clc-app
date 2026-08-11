import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { FilteredMarketVoucherPage, MarketVoucher } from "@clc/api/features/market/client";
import { useVoucherSearch } from "./use-voucher-search";

const getFilteredMarketVouchers = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/market/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clc/api/features/market/client")>();
  return { ...actual, getFilteredMarketVouchers };
});

const RESULT: MarketVoucher = {
  id: "1",
  chainId: 42220,
  address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Sarafu",
  symbol: "SRF",
  iconUrl: null,
  locationName: "Nairobi",
  lat: -1.29,
  lng: 36.82,
  kind: "voucher",
};

function page(vouchers: MarketVoucher[] = [RESULT]): FilteredMarketVoucherPage {
  return {
    vouchers,
    first: 1,
    last: 1,
    receivedCount: vouchers.length,
    tagFacets: null,
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, refetchOnWindowFocus: false } },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  getFilteredMarketVouchers.mockReset();
});

describe("useVoucherSearch", () => {
  it("waits for a useful debounced term before searching", async () => {
    getFilteredMarketVouchers.mockResolvedValue(page());
    const setQuery = vi.fn();
    const { result, rerender } = renderHook(
      ({ query, active }: { query: string; active: boolean }) =>
        useVoucherSearch(query, setQuery, active),
      {
        wrapper: wrapper(newClient()),
        initialProps: { query: "s", active: true },
      },
    );

    expect(result.current.status).toBe("idle");
    expect(getFilteredMarketVouchers).not.toHaveBeenCalled();

    rerender({ query: "sa", active: true });
    expect(result.current.status).toBe("searching");
    expect(result.current.results).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.results).toEqual([RESULT]);
    expect(getFilteredMarketVouchers).toHaveBeenCalledWith(
      expect.objectContaining({
        perPage: 10,
        filter: expect.objectContaining({ term: "sa" }),
      }),
      expect.any(AbortSignal),
    );
  });

  it("hides the previous term's results immediately when the input changes or clears", async () => {
    getFilteredMarketVouchers.mockResolvedValue(page());
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useVoucherSearch(query, vi.fn(), true),
      {
        wrapper: wrapper(newClient()),
        initialProps: { query: "sa" },
      },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.results).toEqual([RESULT]);

    rerender({ query: "sar" });
    expect(result.current.status).toBe("searching");
    expect(result.current.results).toEqual([]);

    rerender({ query: "" });
    expect(result.current.status).toBe("idle");
    expect(result.current.results).toEqual([]);
  });

  it("cancels an in-flight request when its sheet closes", async () => {
    let requestSignal: AbortSignal | undefined;
    getFilteredMarketVouchers.mockImplementation(
      (_params, signal: AbortSignal | undefined) =>
        new Promise<FilteredMarketVoucherPage>((_resolve, reject) => {
          requestSignal = signal;
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );

    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useVoucherSearch("sa", vi.fn(), active),
      {
        wrapper: wrapper(newClient()),
        initialProps: { active: true },
      },
    );

    await waitFor(() => expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(1));
    expect(requestSignal?.aborted).toBe(false);

    act(() => rerender({ active: false }));

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(result.current.status).toBe("idle");
    expect(result.current.results).toEqual([]);
  });
});
