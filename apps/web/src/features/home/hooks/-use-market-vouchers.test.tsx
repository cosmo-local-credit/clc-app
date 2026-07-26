import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucher, MarketVoucherPage } from "#/features/home/api/market-client";
import {
  MARKET_MAP_PAGE_SIZE,
  MIN_VIEWPORT_BBOX_ZOOM,
  marketVoucherQueryKeys,
  useMarketMapVouchers,
} from "./use-market-vouchers";

const getMarketVouchers = vi.hoisted(() => vi.fn());

vi.mock("#/features/home/api/market-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/home/api/market-client")>();
  return { ...actual, getMarketVouchers };
});

function voucher(id: number, overrides: Partial<MarketVoucher> = {}): MarketVoucher {
  return {
    id: String(id),
    chainId: 42220,
    address: "0xAbC0000000000000000000000000000000000123",
    name: `Voucher ${id}`,
    symbol: "VOUCHER",
    locationName: null,
    lat: -1.29,
    lng: 36.82,
    kind: "voucher",
    ...overrides,
  };
}

function page(ids: number[], last = ids.at(-1) ?? 0): MarketVoucherPage {
  return {
    vouchers: ids.map((id) => voucher(id)),
    first: ids[0] ?? 0,
    last,
    receivedCount: ids.length,
  };
}

/** A full page for the map's page size, so pagination is allowed to continue. */
function fullPage(startId: number): MarketVoucherPage {
  const ids = Array.from({ length: MARKET_MAP_PAGE_SIZE }, (_, index) => startId - index);
  return page(ids);
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const NAIROBI_VIEWPORT = { west: 36.6, south: -1.5, east: 37.1, north: -1.1, zoom: 12 };

beforeEach(() => {
  getMarketVouchers.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMarketMapVouchers pagination", () => {
  it("stops after a short page", async () => {
    getMarketVouchers.mockResolvedValue(page([3, 2, 1]));
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.vouchers).toHaveLength(3));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getMarketVouchers).toHaveBeenCalledTimes(1);
    expect(result.current.isCatalogComplete).toBe(true);
  });

  it("stops when the backend reports last as zero", async () => {
    getMarketVouchers.mockResolvedValue({ ...fullPage(1000), last: 0 });
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.vouchers.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getMarketVouchers).toHaveBeenCalledTimes(1);
  });

  it("stops when the last cursor fails to strictly decrease", async () => {
    // A backend that repeats a cursor would otherwise loop forever.
    getMarketVouchers
      .mockResolvedValueOnce(fullPage(1000))
      .mockResolvedValueOnce({ ...fullPage(500), last: 501 })
      .mockResolvedValueOnce({ ...fullPage(400), last: 501 });
    const client = newClient();

    renderHook(() => useMarketMapVouchers(null), { wrapper: wrapper(client) });

    await waitFor(() => expect(getMarketVouchers).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(getMarketVouchers).toHaveBeenCalledTimes(2);
  });

  it("appends and deduplicates across pages", async () => {
    getMarketVouchers
      .mockResolvedValueOnce({
        vouchers: [voucher(3), voucher(2)],
        first: 3,
        last: 2,
        receivedCount: 2,
      })
      .mockResolvedValue({ vouchers: [], first: 0, last: 0, receivedCount: 0 });
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null, 2), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.vouchers).toHaveLength(2));
    expect(result.current.vouchers.map((entry) => entry.id)).toEqual(["3", "2"]);
  });

  it("does not start a next page while a fetch is already in flight", async () => {
    let releaseFirst: (value: MarketVoucherPage) => void = () => {};
    getMarketVouchers
      .mockImplementationOnce(
        () =>
          new Promise<MarketVoucherPage>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue(page([1]));
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null), {
      wrapper: wrapper(client),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    // A stale infinite-query refetch already walks every cached page; the
    // auto-pagination effect must not race it.
    expect(getMarketVouchers).toHaveBeenCalledTimes(1);

    releaseFirst(page([1]));
    await waitFor(() => expect(result.current.vouchers).toHaveLength(1));
  });
});

describe("useMarketMapVouchers viewport bootstrap", () => {
  it("renders the bbox page before the full catalog and deduplicates it away", async () => {
    getMarketVouchers.mockImplementation((params: { bbox?: unknown }) =>
      params.bbox
        ? Promise.resolve({
            vouchers: [voucher(7, { name: "bbox copy" })],
            first: 7,
            last: 7,
            receivedCount: 1,
          })
        : Promise.resolve({
            vouchers: [voucher(7, { name: "catalog copy" })],
            first: 7,
            last: 7,
            receivedCount: 1,
          }),
    );
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(NAIROBI_VIEWPORT), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.vouchers).toHaveLength(1));
    // The same voucher must appear once, and the catalog record wins.
    expect(result.current.vouchers[0]?.name).toBe("catalog copy");
  });

  it("requests both halves of an antimeridian-crossing viewport", async () => {
    getMarketVouchers.mockResolvedValue({ vouchers: [], first: 0, last: 0, receivedCount: 0 });
    const client = newClient();

    renderHook(
      () => useMarketMapVouchers({ west: 179, south: -1.5, east: -179, north: -1.1, zoom: 12 }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => {
      const boxes = getMarketVouchers.mock.calls
        .map((call) => (call[0] as { bbox?: { minLng: number; maxLng: number } }).bbox)
        .filter(Boolean);
      expect(boxes).toHaveLength(2);
    });
  });

  it("makes no viewport request below the minimum bbox zoom", async () => {
    getMarketVouchers.mockResolvedValue({ vouchers: [], first: 0, last: 0, receivedCount: 0 });
    const client = newClient();

    renderHook(
      () =>
        useMarketMapVouchers({
          ...NAIROBI_VIEWPORT,
          zoom: MIN_VIEWPORT_BBOX_ZOOM - 1,
        }),
      { wrapper: wrapper(client) },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    const bboxCalls = getMarketVouchers.mock.calls.filter(
      (call) => (call[0] as { bbox?: unknown }).bbox,
    );
    // At country/world zoom the complete background catalog is the right source.
    expect(bboxCalls).toHaveLength(0);
  });

  it("makes no viewport request once the full catalog has loaded", async () => {
    getMarketVouchers.mockResolvedValue({
      vouchers: [voucher(1)],
      first: 1,
      last: 1,
      receivedCount: 1,
    });
    const client = newClient();

    const { result, rerender } = renderHook(
      ({ viewport }: { viewport: typeof NAIROBI_VIEWPORT | null }) =>
        useMarketMapVouchers(viewport),
      {
        wrapper: wrapper(client),
        initialProps: { viewport: null as typeof NAIROBI_VIEWPORT | null },
      },
    );

    await waitFor(() => expect(result.current.isCatalogComplete).toBe(true));
    getMarketVouchers.mockClear();

    rerender({ viewport: NAIROBI_VIEWPORT });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getMarketVouchers).not.toHaveBeenCalled();
  });

  it("keeps viewport and catalog under separate query keys", () => {
    const catalog = marketVoucherQueryKeys.catalog(MARKET_MAP_PAGE_SIZE);
    const viewport = marketVoucherQueryKeys.viewport(
      [{ minLng: 36.6, minLat: -1.5, maxLng: 37.1, maxLat: -1.1 }],
      MARKET_MAP_PAGE_SIZE,
    );

    expect(JSON.stringify(catalog)).not.toBe(JSON.stringify(viewport));
  });
});

describe("useMarketMapVouchers freshness", () => {
  it("uses the documented local overrides without touching global defaults", async () => {
    getMarketVouchers.mockResolvedValue(page([1]));
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.vouchers).toHaveLength(1));

    const [query] = client
      .getQueryCache()
      .findAll({ queryKey: marketVoucherQueryKeys.catalog(MARKET_MAP_PAGE_SIZE) });
    expect(query?.options.gcTime).toBe(30 * 60_000);

    const observer = query?.observers[0];
    expect(observer?.options.staleTime).toBe(10 * 60_000);
    expect(observer?.options.refetchOnReconnect).toBe(false);

    // The global client must be untouched.
    expect(client.getDefaultOptions().queries?.staleTime).toBe(60_000);
  });

  it("surfaces a load error with a retry", async () => {
    getMarketVouchers.mockRejectedValue(new Error("network down"));
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null), {
      wrapper: wrapper(client),
    });

    // The global default retries once with backoff before surfacing the error.
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 5_000 });
    expect(typeof result.current.retry).toBe("function");

    getMarketVouchers.mockReset();
    getMarketVouchers.mockResolvedValue(page([1]));
    result.current.retry();

    await waitFor(() => expect(result.current.vouchers).toHaveLength(1));
  });
});

describe("useMarketMapVouchers pagination robustness", () => {
  it("keeps paging when a full page contains a malformed row", async () => {
    // 500 raw rows, one of which the client drops: still a full page.
    const kept = Array.from({ length: MARKET_MAP_PAGE_SIZE - 1 }, (_, i) => voucher(2000 - i));
    getMarketVouchers
      .mockResolvedValueOnce({
        vouchers: kept,
        first: 2000,
        last: 1502,
        receivedCount: MARKET_MAP_PAGE_SIZE,
      })
      .mockResolvedValueOnce({ vouchers: [voucher(1)], first: 1, last: 1, receivedCount: 1 });
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null), {
      wrapper: wrapper(client),
    });

    // Without the raw count this stops after page 1 and hides every older
    // voucher in the catalog.
    await waitFor(() => expect(getMarketVouchers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.vouchers).toHaveLength(MARKET_MAP_PAGE_SIZE));
  });

  it("still stops on a genuinely short page", async () => {
    getMarketVouchers.mockResolvedValue({
      vouchers: [voucher(3), voucher(2)],
      first: 3,
      last: 2,
      receivedCount: 2,
    });
    const client = newClient();

    const { result } = renderHook(() => useMarketMapVouchers(null), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isCatalogComplete).toBe(true));
    expect(getMarketVouchers).toHaveBeenCalledTimes(1);
  });
});
