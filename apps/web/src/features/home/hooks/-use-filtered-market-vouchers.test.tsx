import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type { FilteredMarketVoucherPage, MarketVoucher } from "@clc/api/features/market/client";
import {
  FilteredCatalogTooLargeError,
  MAX_FILTERED_PAGES,
  toFilteredCatalogState,
  useFilteredMarketVouchers,
} from "./use-filtered-market-vouchers";
import { MARKET_MAP_PAGE_SIZE } from "./use-market-vouchers";

const getFilteredMarketVouchers = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/market/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clc/api/features/market/client")>();
  return { ...actual, getFilteredMarketVouchers };
});

function filter(overrides: Partial<CatalogFilter> = {}): CatalogFilter {
  return {
    term: "art",
    tags: [],
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
    ...overrides,
  };
}

function voucher(id: number): MarketVoucher {
  return {
    id: String(id),
    chainId: 42220,
    address: "0xAbC0000000000000000000000000000000000123",
    name: `Voucher ${id}`,
    symbol: "VOUCHER",
    iconUrl: null,
    locationName: null,
    lat: -1.29,
    lng: 36.82,
    kind: "voucher",
  };
}

function page(
  ids: number[],
  overrides: Partial<FilteredMarketVoucherPage> = {},
): FilteredMarketVoucherPage {
  return {
    vouchers: ids.map(voucher),
    first: ids[0] ?? 0,
    last: ids.at(-1) ?? 0,
    receivedCount: ids.length,
    tagFacets: null,
    ...overrides,
  };
}

function fullPage(startId: number, overrides: Partial<FilteredMarketVoucherPage> = {}) {
  return page(
    Array.from({ length: MARKET_MAP_PAGE_SIZE }, (_, index) => startId - index),
    overrides,
  );
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 0, refetchOnWindowFocus: false } },
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("filtered catalog atomicity", () => {
  it("resolves once with the whole set, never exposing a partial walk", async () => {
    getFilteredMarketVouchers
      .mockResolvedValueOnce(fullPage(3000))
      .mockResolvedValueOnce(fullPage(2500))
      .mockResolvedValueOnce(page([1999, 1998]));

    const observed: (number | undefined)[] = [];
    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    observed.push(result.current.data?.vouchers.length);

    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(3);
    expect(observed).toEqual([MARKET_MAP_PAGE_SIZE * 2 + 2]);
  });

  it("asks for facets on the first request only", async () => {
    getFilteredMarketVouchers
      .mockResolvedValueOnce(fullPage(3000, { tagFacets: [{ tag: "Art", count: 4 }] }))
      .mockResolvedValueOnce(page([2499]));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const facetFlags = getFilteredMarketVouchers.mock.calls.map(([params]) => params.facets);
    expect(facetFlags).toEqual([true, false]);
    expect(result.current.data?.tagFacets).toEqual([{ tag: "Art", count: 4 }]);
  });

  it("sends the filter and cursor on every page of the walk", async () => {
    getFilteredMarketVouchers
      .mockResolvedValueOnce(fullPage(3000))
      .mockResolvedValueOnce(page([2499]));

    const active = filter({ tags: ["Art", "Mobility"], tagMatch: "all" });
    const { result } = renderHook(() => useFilteredMarketVouchers(active), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calls = getFilteredMarketVouchers.mock.calls.map(([params]) => params);
    expect(calls[0]).toMatchObject({ filter: active, cursor: undefined, next: undefined });
    expect(calls[1]).toMatchObject({ filter: active, cursor: 2501, next: true });
  });
});

describe("filtered catalog walk termination", () => {
  it("stops on a short page", async () => {
    getFilteredMarketVouchers.mockResolvedValueOnce(page([3000, 2999]));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(1);
  });

  it("stops on an empty page reporting a zero cursor", async () => {
    getFilteredMarketVouchers.mockResolvedValueOnce(fullPage(3000, { last: 0 }));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(1);
  });

  it("stops when the cursor fails to strictly decrease", async () => {
    getFilteredMarketVouchers
      .mockResolvedValueOnce(fullPage(3000))
      .mockResolvedValueOnce(fullPage(3000));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(2);
  });

  it("fails rather than truncating when the page cap is hit with rows outstanding", async () => {
    getFilteredMarketVouchers.mockImplementation(({ cursor }: { cursor?: number }) =>
      Promise.resolve(fullPage(cursor === undefined ? 100_000 : cursor - 1)),
    );

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(FilteredCatalogTooLargeError);
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(MAX_FILTERED_PAGES);
    expect(result.current.data).toBeUndefined();
  });

  it("succeeds when the walk finishes exactly on the cap", async () => {
    for (let index = 0; index < MAX_FILTERED_PAGES - 1; index++) {
      getFilteredMarketVouchers.mockResolvedValueOnce(fullPage(100_000 - index * 1000));
    }
    getFilteredMarketVouchers.mockResolvedValueOnce(page([1]));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(MAX_FILTERED_PAGES);
  });
});

describe("filtered catalog request discipline", () => {
  it("issues no request without a valid filter", async () => {
    const { result } = renderHook(() => useFilteredMarketVouchers(null), {
      wrapper: wrapper(newClient()),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getFilteredMarketVouchers).not.toHaveBeenCalled();
    expect(toFilteredCatalogState(result.current, false)).toEqual({ status: "disabled" });
  });

  it("does not retry a 4xx", async () => {
    getFilteredMarketVouchers.mockRejectedValue(new BackendApiError(400, "invalid filters", "E04"));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 429, which would spend the burst it just exhausted", async () => {
    getFilteredMarketVouchers.mockRejectedValue(new BackendApiError(429, "rate limit exceeded"));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(1);
  });

  it("still retries a 5xx once, matching the global default", async () => {
    getFilteredMarketVouchers
      .mockRejectedValueOnce(new BackendApiError(503, "unavailable"))
      .mockResolvedValueOnce(page([3000]));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(2);
  });

  it("passes one abort signal through the whole walk", async () => {
    getFilteredMarketVouchers
      .mockResolvedValueOnce(fullPage(3000))
      .mockResolvedValueOnce(page([2499]));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const signals = getFilteredMarketVouchers.mock.calls.map(([, signal]) => signal);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
  });
});

describe("filtered catalog view state", () => {
  it("reports loading on a cold filtered load, never ready", async () => {
    let release: (page: FilteredMarketVoucherPage) => void = () => {};
    getFilteredMarketVouchers.mockImplementation(
      () => new Promise<FilteredMarketVoucherPage>((resolve) => (release = resolve)),
    );

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() =>
      expect(toFilteredCatalogState(result.current, false).status).toBe("loading"),
    );

    release(page([3000]));
    await waitFor(() => expect(toFilteredCatalogState(result.current, false).status).toBe("ready"));
  });

  it("reports refining while a keystroke is pending, keeping the previous data", async () => {
    getFilteredMarketVouchers.mockResolvedValue(page([3000]));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const state = toFilteredCatalogState(result.current, true);
    expect(state.status).toBe("refining");
    if (state.status === "refining") expect(state.data.vouchers).toHaveLength(1);
  });

  it("retains the last complete result across a filter change", async () => {
    getFilteredMarketVouchers.mockResolvedValueOnce(page([3000, 2999]));

    const client = newClient();
    const { result, rerender } = renderHook(
      ({ term }: { term: string }) => useFilteredMarketVouchers(filter({ term })),
      { wrapper: wrapper(client), initialProps: { term: "art" } },
    );

    await waitFor(() => expect(result.current.data?.vouchers).toHaveLength(2));

    let release: (page: FilteredMarketVoucherPage) => void = () => {};
    getFilteredMarketVouchers.mockImplementation(
      () => new Promise<FilteredMarketVoucherPage>((resolve) => (release = resolve)),
    );
    rerender({ term: "artisan" });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data?.vouchers).toHaveLength(2);
    expect(toFilteredCatalogState(result.current, false).status).toBe("refining");

    release(page([1000]));
    await waitFor(() => expect(result.current.data?.vouchers).toHaveLength(1));
  });

  it("surfaces an error as error, not as an empty ready set", async () => {
    getFilteredMarketVouchers.mockRejectedValue(new BackendApiError(400, "invalid filters", "E04"));

    const { result } = renderHook(() => useFilteredMarketVouchers(filter()), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toFilteredCatalogState(result.current, false).status).toBe("error");
  });
});
